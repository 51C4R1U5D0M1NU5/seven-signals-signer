import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { Contract, Interface, JsonRpcProvider, getCreate2Address, id, keccak256 } from 'ethers';

const TX_HASH = '0x9fc47da4aa19873e6537df1e75241d529abc8251a09e96ae8445838ddab6d7f5';
const RPC = 'https://sepolia.base.org';
const FACTORY = '0x13b0D85CcB8bf860b6b79AF3029fCA081AE9beF2';
const EXPECTED_OWNER = '0x78ceE8B10C4FC39FbD47B17Bb78aADe2838d05DC';
const EXPECTED_CALLDATA_SHA256 = 'db68fa32e68f5e788258d78a71b64f902628ebdf74c6a4d00fa5f146edbd4102';
const EXPECTED_RUNTIME_SHA256 = 'f414afe330dfe6e29426a1abef9435dbcdd2735e93d6c9b52e44c4551c5e44f0';
const EXPECTED_PRICES = [
  1597601155164444n,
  3727736028717036n,
  6390404620657775n,
  6390404620657775n,
  1597601155164444n,
  3727736028717036n,
  13313342959703697n,
];
const EXPECTED_CAPS = [10n, 5n, 1n, 1n, 10n, 5n, 1n];
const BASE_URI = 'https://idmsuymlbvznnohdfutj.supabase.co/storage/v1/object/public/seven-signals/metadata/';
const PAYLOAD_URL = 'https://idmsuymlbvznnohdfutj.supabase.co/rest/v1/seven_signals_payload?id=eq.base-sepolia-v1&select=payload_gzip_b64,calldata_sha256,calldata_bytes';
const APIKEY = 'sb_publishable_yAeIu7mTkHsdp8yUBMb4Og_CR20siDT';

function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

const payloadResponse = await fetch(PAYLOAD_URL, { headers: { apikey: APIKEY } });
assert.equal(payloadResponse.ok, true, `payload HTTP ${payloadResponse.status}`);
const rows = await payloadResponse.json();
assert.equal(rows.length, 1, 'canonical payload row missing');
assert.equal(rows[0].calldata_sha256, EXPECTED_CALLDATA_SHA256);
assert.equal(Number(rows[0].calldata_bytes), 9796);
const calldataBytes = gunzipSync(Buffer.from(rows[0].payload_gzip_b64, 'base64'));
assert.equal(calldataBytes.length, 9796);
assert.equal(sha256Hex(calldataBytes), EXPECTED_CALLDATA_SHA256);
const calldata = `0x${calldataBytes.toString('hex')}`;
assert.equal(calldata.slice(0, 10), '0x66cfa057');

const factoryInterface = new Interface(['function deploy(uint256 value, bytes32 salt, bytes bytecode)']);
assert.equal(factoryInterface.getFunction('deploy').selector, '0x66cfa057');
const decoded = factoryInterface.decodeFunctionData('deploy', calldata);
assert.equal(decoded.value, 0n);
const salt = decoded.salt;
const initCode = decoded.bytecode;
const deployed = getCreate2Address(FACTORY, salt, keccak256(initCode));

const provider = new JsonRpcProvider(RPC, 84532, { staticNetwork: true });
const network = await provider.getNetwork();
assert.equal(network.chainId, 84532n);
const receipt = await provider.getTransactionReceipt(TX_HASH);
assert.ok(receipt, 'transaction receipt missing');
assert.equal(receipt.status, 1, 'transaction reverted');
assert.ok(receipt.blockNumber > 0, 'transaction is not mined');

const deployedLogs = receipt.logs.filter((log) => log.address.toLowerCase() === deployed.toLowerCase());
assert.ok(deployedLogs.length > 0, 'transaction receipt has no logs from predicted CREATE2 contract');
const ownershipTopic = id('OwnershipTransferred(address,address)');
const ownershipLog = deployedLogs.find((log) => log.topics[0] === ownershipTopic);
assert.ok(ownershipLog, 'constructor OwnershipTransferred log missing');
const ownerFromLog = `0x${ownershipLog.topics[2].slice(26)}`;
assert.equal(ownerFromLog.toLowerCase(), EXPECTED_OWNER.toLowerCase());

const code = await provider.getCode(deployed, receipt.blockNumber);
assert.notEqual(code, '0x', 'deployed runtime code missing');
const runtimeBytes = Buffer.from(code.slice(2), 'hex');
assert.equal(runtimeBytes.length, 7532);
assert.equal(sha256Hex(runtimeBytes), EXPECTED_RUNTIME_SHA256);

const abi = [
  'function owner() view returns (address)',
  'function pendingOwner() view returns (address)',
  'function royaltyInfo(uint256 tokenId, uint256 salePrice) view returns (address receiver, uint256 royaltyAmount)',
  'function priceWei(uint256 id) view returns (uint256)',
  'function maxSupply(uint256 id) pure returns (uint256)',
  'function uri(uint256 id) view returns (string)',
  'function totalSupply(uint256 id) view returns (uint256)',
  'function paused() view returns (bool)',
  'function supportsInterface(bytes4 interfaceId) view returns (bool)',
];
const contract = new Contract(deployed, abi, provider);
assert.equal((await contract.owner()).toLowerCase(), EXPECTED_OWNER.toLowerCase());
assert.equal(await contract.pendingOwner(), '0x0000000000000000000000000000000000000000');
assert.equal(await contract.paused(), false);
assert.equal(await contract.supportsInterface('0xd9b67a26'), true, 'ERC-1155 interface missing');
assert.equal(await contract.supportsInterface('0x2a55205a'), true, 'ERC-2981 interface missing');

for (let i = 0; i < 7; i++) {
  const tokenId = BigInt(i + 1);
  assert.equal(await contract.priceWei(tokenId), EXPECTED_PRICES[i], `price mismatch for id ${tokenId}`);
  assert.equal(await contract.maxSupply(tokenId), EXPECTED_CAPS[i], `cap mismatch for id ${tokenId}`);
  assert.equal(await contract.totalSupply(tokenId), 0n, `initial supply mismatch for id ${tokenId}`);
  assert.equal(await contract.uri(tokenId), `${BASE_URI}${tokenId}.json`, `URI mismatch for id ${tokenId}`);
}

const [royaltyReceiver, royaltyAmount] = await contract.royaltyInfo(1n, 10000n);
assert.equal(royaltyReceiver.toLowerCase(), EXPECTED_OWNER.toLowerCase());
assert.equal(royaltyAmount, 300n);

console.log(JSON.stringify({
  ok: true,
  chainId: Number(network.chainId),
  txHash: TX_HASH,
  blockNumber: receipt.blockNumber,
  deployedAddress: deployed,
  receiptStatus: receipt.status,
  runtimeBytes: runtimeBytes.length,
  runtimeSha256: sha256Hex(runtimeBytes),
  calldataSha256: EXPECTED_CALLDATA_SHA256,
  owner: await contract.owner(),
  royaltyReceiver,
  royaltyBps: 300,
  pricesWei: EXPECTED_PRICES.map(String),
  caps: EXPECTED_CAPS.map(String),
  uri1: await contract.uri(1n),
  erc1155: true,
  erc2981: true,
  initialSupplyAllZero: true
}, null, 2));

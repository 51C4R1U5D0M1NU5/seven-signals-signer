import fs from 'node:fs';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { createBundlerClient, toCoinbaseSmartAccount } from 'viem/account-abstraction';

const payload = JSON.parse(fs.readFileSync(new URL('./canonical-sepolia-payload.json', import.meta.url), 'utf8'));
const ZERO = '0x0000000000000000000000000000000000000000';
const EXPECTED_CAPS = [10n, 5n, 1n, 1n, 10n, 5n, 1n];
const EXPECTED_PRICES = payload.constructor.pricesWei.map(BigInt);
const RPC_PROXY = 'https://seven-signals-signer1.vercel.app/api/cdp';

function sha256Hex(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function assert(condition, message) { if (!condition) throw new Error(message); }
function eqAddress(a, b) { return String(a).toLowerCase() === String(b).toLowerCase(); }

assert(payload.chainId === 84532, 'wrong payload chain ID');
assert(payload.a6.finalSealCommit === '40be6ba1a55f81c62472de0ad756c5b2a33fe656', 'A6 seal mismatch');
assert(payload.a6.reviewedPayloadCommit === '21b6e54333b34a2b719749bbfa69f94b4609ea6a', 'reviewed commit mismatch');
assert(payload.a6.reviewedPayloadTree === 'f38faef6aa748279e9ec163bc956d9ace898f200', 'reviewed tree mismatch');
assert(payload.a6.releaseManifestSha256 === 'bcd2448140aaa41298d98f049bcaa5adfce9b7e638860eb5733f4f2a497d3ea5', 'release manifest mismatch');
assert(payload.build.runtimeSha256 === 'b14fee39aef196e8f78f60808cb9c11923af898f2e1dd10d77eab55a1fb097b1', 'runtime hash mismatch');
assert(payload.build.runtimeBytes === 8768, 'runtime length mismatch');

const calldataBytes = zlib.gunzipSync(Buffer.from(payload.payload.gzipBase64, 'base64'));
assert(calldataBytes.length === payload.payload.calldataBytes, 'factory calldata length mismatch');
assert(sha256Hex(calldataBytes) === payload.payload.calldataSha256, 'factory calldata SHA-256 mismatch');
const calldata = `0x${calldataBytes.toString('hex')}`;
assert(calldata.slice(0, 10) === payload.payload.selector, 'factory selector mismatch');

const publicClient = createPublicClient({ chain: baseSepolia, transport: http(RPC_PROXY) });
const chainId = await publicClient.getChainId();
assert(chainId === 84532, `RPC returned chain ${chainId}`);

const predicted = payload.predictedAddress;
const beforeCode = await publicClient.getCode({ address: predicted });
assert(!beforeCode || beforeCode === '0x', `predicted address already contains code: ${predicted}`);

const ephemeralOwner = privateKeyToAccount(generatePrivateKey());
const smartAccount = await toCoinbaseSmartAccount({ client: publicClient, owners: [ephemeralOwner] });
const bundlerClient = createBundlerClient({ account: smartAccount, client: publicClient, chain: baseSepolia, transport: http(RPC_PROXY) });
smartAccount.userOperation = {
  estimateGas: async (userOperation) => {
    const estimate = await bundlerClient.estimateUserOperationGas(userOperation);
    estimate.preVerificationGas = estimate.preVerificationGas * 2n;
    return estimate;
  },
};

const userOperationHash = await bundlerClient.sendUserOperation({ account: smartAccount, calls: [{ to: payload.factory, value: 0n, data: calldata }], paymaster: true });
const userOperationReceipt = await bundlerClient.waitForUserOperationReceipt({ hash: userOperationHash, timeout: 180000 });
const transactionHash = userOperationReceipt?.receipt?.transactionHash;
assert(/^0x[0-9a-fA-F]{64}$/.test(String(transactionHash)), 'confirmed user operation has no transaction hash');

const receipt = await publicClient.getTransactionReceipt({ hash: transactionHash });
assert(receipt.status === 'success', 'deployment transaction reverted');
const code = await publicClient.getCode({ address: predicted, blockNumber: receipt.blockNumber });
assert(code && code !== '0x', 'deployed runtime code missing');
const runtimeBytes = Buffer.from(code.slice(2), 'hex');
assert(runtimeBytes.length === payload.build.runtimeBytes, 'runtime byte length mismatch');
assert(sha256Hex(runtimeBytes) === payload.build.runtimeSha256, 'runtime SHA-256 mismatch');

const abi = [
  { type: 'function', name: 'owner', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'pendingOwner', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'paused', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'contractURI', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'uri', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'maxSupply', stateMutability: 'pure', inputs: [{ type: 'uint256' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'mintPrice', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'mintedSupply', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'totalSupply', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'royaltyInfo', stateMutability: 'view', inputs: [{ type: 'uint256' }, { type: 'uint256' }], outputs: [{ type: 'address' }, { type: 'uint256' }] },
  { type: 'function', name: 'supportsInterface', stateMutability: 'view', inputs: [{ type: 'bytes4' }], outputs: [{ type: 'bool' }] },
];
const read = (functionName, args = []) => publicClient.readContract({ address: predicted, abi, functionName, args });
const owner = await read('owner');
const pendingOwner = await read('pendingOwner');
const paused = await read('paused');
const contractURI = await read('contractURI');
assert(eqAddress(owner, payload.constructor.initialOwner), 'owner mismatch');
assert(eqAddress(pendingOwner, ZERO), 'pending owner mismatch');
assert(paused === true, 'contract must begin paused');
assert(contractURI === payload.constructor.collectionURI, 'contract URI mismatch');

const interfaces = {};
for (const interfaceId of ['0x01ffc9a7', '0xd9b67a26', '0x0e89341c', '0x2a55205a']) {
  interfaces[interfaceId] = await read('supportsInterface', [interfaceId]);
  assert(interfaces[interfaceId] === true, `missing interface ${interfaceId}`);
}

const tokens = [];
for (let i = 0; i < 7; i++) {
  const tokenId = BigInt(i + 1);
  const uri = await read('uri', [tokenId]);
  const cap = await read('maxSupply', [tokenId]);
  const mintPriceWei = await read('mintPrice', [tokenId]);
  const mintedSupply = await read('mintedSupply', [tokenId]);
  const totalSupply = await read('totalSupply', [tokenId]);
  assert(uri === `${payload.constructor.tokenBaseURI}${tokenId}.json`, `URI mismatch for token ${tokenId}`);
  assert(cap === EXPECTED_CAPS[i], `cap mismatch for token ${tokenId}`);
  assert(mintPriceWei === EXPECTED_PRICES[i], `mint price mismatch for token ${tokenId}`);
  assert(mintedSupply === 0n, `minted supply not zero for token ${tokenId}`);
  assert(totalSupply === 0n, `total supply not zero for token ${tokenId}`);
  tokens.push({ tokenId: Number(tokenId), uri, cap: String(cap), mintPriceWei: String(mintPriceWei), mintedSupply: String(mintedSupply), totalSupply: String(totalSupply) });
}

const [royaltyReceiver, royaltyAmount] = await read('royaltyInfo', [1n, 10000n]);
assert(eqAddress(royaltyReceiver, payload.constructor.royaltyReceiver), 'royalty receiver mismatch');
assert(royaltyAmount === BigInt(payload.constructor.royaltyBps), 'royalty bps mismatch');
const balanceWei = await publicClient.getBalance({ address: predicted, blockNumber: receipt.blockNumber });

const record = {
  schemaVersion: 1,
  status: 'ONCHAIN_VERIFIED',
  verifiedAt: new Date().toISOString(),
  chainId,
  a6: payload.a6,
  sourceBoundPayload: {
    payloadFileSha256: sha256Hex(fs.readFileSync(new URL('./canonical-sepolia-payload.json', import.meta.url))),
    calldataSha256: payload.payload.calldataSha256,
    initCodeKeccak256: payload.payload.initCodeKeccak256,
    runtimeSha256: payload.build.runtimeSha256,
    runtimeBytes: payload.build.runtimeBytes,
    salt: payload.salt,
    factory: payload.factory,
    predictedAddress: predicted,
  },
  deployment: {
    smartAccount: smartAccount.address,
    sponsored: true,
    transactionValueWei: '0',
    userOperationHash,
    transactionHash,
    blockNumber: String(receipt.blockNumber),
    gasUsed: String(receipt.gasUsed),
    effectiveGasPrice: String(receipt.effectiveGasPrice ?? 0n),
  },
  readbacks: {
    owner,
    pendingOwner,
    paused,
    contractURI,
    royalty: { receiver: royaltyReceiver, bps: Number(royaltyAmount) },
    interfaces,
    codeSha256: sha256Hex(runtimeBytes),
    balanceWei: String(balanceWei),
    tokens,
  },
};
fs.writeFileSync('a7-sepolia-receipt.json', JSON.stringify(record, null, 2) + '\n');
console.log(JSON.stringify(record, null, 2));

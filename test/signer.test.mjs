import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('uses a disposable local Base Sepolia signer and preserves deployment locks', () => {
  assert.doesNotMatch(html, /window\.ethereum/);
  assert.doesNotMatch(html, /createBaseAccountSDK/);
  assert.match(html, /ethers\.Wallet\.createRandom/);
  assert.match(html, /ethers\.JsonRpcProvider/);
  assert.match(html, /https:\/\/sepolia\.base\.org/);
  assert.match(html, /84532n/);
  assert.match(html, /FACTORY='0x13b0D85CcB8bf860b6b79AF3029fCA081AE9beF2'/);
  assert.match(html, /EXPECTED_HASH='db68fa32e68f5e788258d78a71b64f902628ebdf74c6a4d00fa5f146edbd4102'/);
  assert.match(html, /EXPECTED_BYTES=9796/);
  assert.match(html, /wallet\.sendTransaction\(\{to:FACTORY,data:DATA,value:0n\}\)/);
  assert.match(html, /0x78ceE8B10C4FC39FbD47B17Bb78aADe2838d05DC/);
  assert.match(html, /Base Sepolia only/);
});

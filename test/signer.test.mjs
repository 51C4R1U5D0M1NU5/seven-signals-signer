import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('uses an injected browser wallet for Base Sepolia and preserves deployment locks', () => {
  assert.doesNotMatch(html, /createBaseAccountSDK/);
  assert.match(html, /window\.ethereum/);
  assert.match(html, /wallet_switchEthereumChain/);
  assert.match(html, /wallet_addEthereumChain/);
  assert.match(html, /https:\/\/sepolia\.base\.org/);
  assert.match(html, /CHAIN='0x14a34'/);
  assert.match(html, /FACTORY='0x13b0D85CcB8bf860b6b79AF3029fCA081AE9beF2'/);
  assert.match(html, /EXPECTED_HASH='db68fa32e68f5e788258d78a71b64f902628ebdf74c6a4d00fa5f146edbd4102'/);
  assert.match(html, /EXPECTED_BYTES=9796/);
  assert.match(html, /from:account,to:FACTORY,value:'0x0',data:DATA/);
});

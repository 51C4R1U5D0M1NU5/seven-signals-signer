import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('uses a gas-sponsored Base Sepolia smart account and preserves deployment locks', () => {
  assert.doesNotMatch(html, /faucet/i);
  assert.doesNotMatch(html, /getBalance\(/);
  assert.match(html, /toCoinbaseSmartAccount/);
  assert.match(html, /createBundlerClient/);
  assert.match(html, /privateKeyToAccount/);
  assert.match(html, /paymaster:\s*true/);
  assert.match(html, /baseSepolia/);
  assert.match(html, /FACTORY='0x13b0D85CcB8bf860b6b79AF3029fCA081AE9beF2'/);
  assert.match(html, /EXPECTED_HASH='db68fa32e68f5e788258d78a71b64f902628ebdf74c6a4d00fa5f146edbd4102'/);
  assert.match(html, /EXPECTED_BYTES=9796/);
  assert.match(html, /EXPECTED_RUNTIME_SHA='f414afe330dfe6e29426a1abef9435dbcdd2735e93d6c9b52e44c4551c5e44f0'/);
  assert.match(html, /0x78ceE8B10C4FC39FbD47B17Bb78aADe2838d05DC/);
  assert.match(html, /calls:\s*\[\{to:FACTORY,value:0n,data:DATA\}\]/);
});

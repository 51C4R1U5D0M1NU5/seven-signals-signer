import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const proxyUrl = new URL('../api/cdp.js', import.meta.url);

test('uses CDP-sponsored Base Sepolia smart account and preserves canonical deployment locks', () => {
  assert.doesNotMatch(html, /faucet/i);
  assert.doesNotMatch(html, /getBalance\(/);
  assert.doesNotMatch(html, /CDP_PAYMASTER_URL/);
  assert.match(html, /toCoinbaseSmartAccount/);
  assert.match(html, /createBundlerClient/);
  assert.match(html, /privateKeyToAccount/);
  assert.match(html, /generatePrivateKey/);
  assert.match(html, /baseSepolia/);
  assert.match(html, /http\('\/api\/cdp'\)/);
  assert.match(html, /paymaster:\s*true/);
  assert.match(html, /calls:\s*\[\{\s*to:\s*FACTORY,\s*value:\s*0n,\s*data:\s*DATA\s*\}\]/);
  assert.match(html, /FACTORY='0x13b0D85CcB8bf860b6b79AF3029fCA081AE9beF2'/);
  assert.match(html, /EXPECTED_HASH='db68fa32e68f5e788258d78a71b64f902628ebdf74c6a4d00fa5f146edbd4102'/);
  assert.match(html, /EXPECTED_BYTES=9796/);
  assert.match(html, /0x78ceE8B10C4FC39FbD47B17Bb78aADe2838d05DC/);
});

test('keeps the CDP Paymaster & Bundler endpoint server-side behind a same-origin proxy', () => {
  assert.equal(existsSync(proxyUrl), true, 'api/cdp.js must exist');
  const proxy = readFileSync(proxyUrl, 'utf8');
  assert.match(proxy, /process\.env\.CDP_PAYMASTER_URL/);
  assert.match(proxy, /seven-signals-signer1\.vercel\.app/);
  assert.match(proxy, /fetch\(upstream/);
  assert.doesNotMatch(proxy, /api\.developer\.coinbase\.com\/rpc\/v1\/base-sepolia\/[A-Za-z0-9_-]{8,}/);
});

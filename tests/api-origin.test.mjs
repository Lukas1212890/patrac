import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedOrigin } from '../worker/origin.mjs';
test('Cloudflare API accepts only exact configured frontend origins', () => {
  const origins = 'https://patrac.stopik.cz, https://patrac-example.vercel.app';
  assert.equal(allowedOrigin('https://patrac.stopik.cz', origins), true);
  assert.equal(allowedOrigin('https://patrac-example.vercel.app', origins), true);
  for (const origin of ['null', '', null, 'https://patrac.stopik.cz.attacker.test', 'http://patrac.stopik.cz', 'https://attacker.vercel.app']) assert.equal(allowedOrigin(origin, origins), false);
  assert.equal(allowedOrigin('https://patrac.stopik.cz', ''), false);
});

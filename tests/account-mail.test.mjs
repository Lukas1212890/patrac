import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { validMailSignature } from '../app/lib/accountMailSignature.mjs';
test('SMTP relay rejects unsigned, modified, expired and wrong-key requests', () => {
  const key = 'test-signing-secret-more-than-thirty-two-characters', now = 1793170000000, timestamp = String(now), body = JSON.stringify({ to: 'test@example.com' });
  const signature = createHmac('sha256', key).update(timestamp + '.' + body).digest('hex');
  assert.equal(validMailSignature(body, timestamp, signature, key, now), true);
  assert.equal(validMailSignature(body, timestamp, '', key, now), false);
  assert.equal(validMailSignature(body + 'x', timestamp, signature, key, now), false);
  assert.equal(validMailSignature(body, timestamp, signature, key + 'x', now), false);
  assert.equal(validMailSignature(body, timestamp, signature, key, now + 61000), false);
  assert.equal(validMailSignature(body, timestamp, signature, key, now - 61000), false);
});

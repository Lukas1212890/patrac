import { createHmac, timingSafeEqual } from 'node:crypto';
export function validMailSignature(text, timestamp, signature, secret, now = Date.now()) {
  if (!secret || secret.length < 32 || !/^\d{13}$/.test(timestamp) || Math.abs(now - Number(timestamp)) > 60000 || !/^[a-f0-9]{64}$/.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(timestamp + '.' + text).digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}

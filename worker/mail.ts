import { env } from 'cloudflare:workers';
export async function sendAccountMail(to: string, subject: string, text: string) {
  if (env.PATRAC_REGISTRATION_READY !== 'true') throw Error('Mail delivery is not enabled');
  const url = new URL(env.PATRAC_MAIL_RELAY_URL);
  if (url.protocol !== 'https:') throw Error('Invalid mail relay');
  const body = JSON.stringify({ to, subject, text }), timestamp = String(Date.now());
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.PATRAC_AUTH_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(timestamp + '.' + body))), n => n.toString(16).padStart(2, '0')).join('');
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Patrac-Timestamp': timestamp, 'X-Patrac-Signature': signature }, body, signal: AbortSignal.timeout(15000), redirect: 'error' });
  if (!response.ok) throw Error('Mail delivery failed');
}

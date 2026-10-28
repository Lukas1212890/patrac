import { APIError } from 'better-auth/api';
import { env } from './runtime';
export async function sendAccountMail(to: string, subject: string, text: string) {
  if (env.PATRAC_REGISTRATION_READY !== 'true') throw Error('Mail delivery is not enabled');
  const url = new URL(env.PATRAC_MAIL_RELAY_URL);
  if (url.protocol !== 'https:') throw Error('Invalid mail relay');
  const body = JSON.stringify({ to, subject, text }), timestamp = String(Date.now());
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.PATRAC_AUTH_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(timestamp + '.' + body))), n => n.toString(16).padStart(2, '0')).join('');
  let response: Response;
  try { response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Patrac-Timestamp': timestamp, 'X-Patrac-Signature': signature }, body, signal: AbortSignal.timeout(15000), redirect: 'manual' }); }
  catch (error: unknown) { console.error('patrac_mail_relay', (error as { name?: string })?.name === 'TimeoutError' ? 'RELAY_TIMEOUT' : 'RELAY_CONNECTION_FAILED'); throw new APIError('SERVICE_UNAVAILABLE', { message: 'E-mail se nepodařilo odeslat.', code: 'RELAY_CONNECTION_FAILED' }); }
  if (!response.ok) {
    const result = await response.json().catch(() => null) as { code?: string } | null;
    const known = ['MAIL_NOT_CONFIGURED', 'MAIL_SIGNATURE_INVALID', 'SMTP_AUTH_FAILED', 'SMTP_ADDRESS_REJECTED', 'SMTP_CONNECTION_FAILED', 'SMTP_SEND_FAILED'];
    console.error('patrac_mail_relay', 'HTTP_' + response.status, known.includes(result?.code || '') ? result!.code : 'RELAY_REJECTED');
    throw new APIError('SERVICE_UNAVAILABLE', { message: 'E-mail se nepodařilo odeslat.', code: known.includes(result?.code || '') ? result!.code! : 'RELAY_HTTP_' + response.status });
  }
}

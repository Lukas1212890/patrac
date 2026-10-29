import { validMailSignature } from '../../../lib/accountMailSignature.mjs';
import nodemailer from 'nodemailer';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const reply = (status: number, code?: string) => { if (code) console.warn('patrac_account_mail', code); return Response.json({ ok: status === 200, ...(code ? { code } : {}) }, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } }); };
export async function POST(request: Request) {
  const secret = process.env.PATRAC_AUTH_SECRET;
  if (!secret || secret.length < 32 || !process.env.PATRAC_SMTP_PASSWORD) return reply(503, 'MAIL_NOT_CONFIGURED');
  const timestamp = request.headers.get('x-patrac-timestamp') || '', signature = request.headers.get('x-patrac-signature') || '';
  if (!/^\d{13}$/.test(timestamp) || Math.abs(Date.now() - Number(timestamp)) > 60000 || !/^[a-f0-9]{64}$/.test(signature)) return reply(403);
  const reader = request.body?.getReader(); if (!reader) return reply(400);
  let length = 0; const chunks: Uint8Array[] = [];
  while (true) { const { value, done } = await reader.read(); if (done) break; length += value.length; if (length > 16000) { await reader.cancel(); return reply(413); } chunks.push(value); }
  const text = Buffer.concat(chunks).toString('utf8');
  if (!validMailSignature(text, timestamp, signature, secret)) return reply(403, 'MAIL_SIGNATURE_INVALID');
  let input; try { input = JSON.parse(text); } catch { return reply(400); }
  if (typeof input.to !== 'string' || !/^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/.test(input.to) || input.to.length > 254 || !['Potvrzení účtu – Pátrač', 'Obnova hesla – Pátrač', 'Potvrzení platby – Pátrač'].includes(input.subject) || typeof input.text !== 'string' || input.text.length > 12000) return reply(400);
  const transport = nodemailer.createTransport({ host: 'smtp.websupport.cz', port: 465, secure: true, auth: { user: 'stopar@stopik.cz', pass: process.env.PATRAC_SMTP_PASSWORD }, connectionTimeout: 10000, socketTimeout: 15000 });
  try {
    await transport.sendMail({ from: { name: 'Pátrač', address: 'patrac@stopik.cz' }, to: input.to, subject: input.subject, text: input.text, disableFileAccess: true, disableUrlAccess: true });
    console.info('patrac_account_mail', 'SMTP_ACCEPTED');
    return reply(200);
  } catch (error: unknown) {
    const code = (error as { code?: string })?.code;
    return reply(502, code === 'EAUTH' ? 'SMTP_AUTH_FAILED' : code === 'EENVELOPE' ? 'SMTP_ADDRESS_REJECTED' : ['ETIMEDOUT', 'ECONNECTION', 'ESOCKET', 'ECONNREFUSED', 'EDNS'].includes(code || '') ? 'SMTP_CONNECTION_FAILED' : 'SMTP_SEND_FAILED');
  }
  finally { transport.close(); }
}

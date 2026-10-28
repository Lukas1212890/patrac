import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { APIError } from 'better-auth/api';
import { getMigrations } from 'better-auth/db/migration';
import { createAccountAuth } from '../worker/lib/accountAuth.mjs';
const origin = 'http://localhost:3000', base = 'http://localhost:8790';
async function fixture(mailFailure = false) {
  const db = new DatabaseSync(':memory:'), mail = [];
  const auth = createAccountAuth({ DB: db, PATRAC_AUTH_SECRET: 'test-secret-with-more-than-thirty-two-characters', PATRAC_AUTH_BASE_URL: base, PATRAC_ALLOWED_ORIGINS: origin, sendMail: async (to, subject, text) => { if (mailFailure) throw new APIError('SERVICE_UNAVAILABLE', { message: 'Mail failed', code: 'MAIL_SIGNATURE_INVALID' }); mail.push({ to, subject, text }); } });
  await (await getMigrations(auth.options)).runMigrations();
  const request = (path, body, token, extra = {}) => auth.handler(new Request(base + '/api/auth/' + path, { method: body ? 'POST' : 'GET', headers: { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.1', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...extra }, ...(body ? { body: JSON.stringify(body) } : {}) }));
  return { auth, db, mail, request };
}
const password = 'a-strong-test-password-9812';
async function verified(f) {
  const signup = await f.request('sign-up/email', { email: 'tester@example.com', password, name: 'Test', callbackURL: origin + '/?account=verified' });
  assert.equal(signup.status, 200, await signup.text());
  const link = f.mail.at(-1).text.match(/https?:\/\/\S+/)[0];
  const verify = await f.auth.handler(new Request(link));
  assert.equal(verify.status, 302);
  return f.request('sign-in/email', { email: 'tester@example.com', password });
}
test('creator must verify email; passwords are hashed; signed sessions reject forgeries and logout revokes them', async () => {
  const f = await fixture();
  const signup = await f.request('sign-up/email', { email: 'tester@example.com', password, name: 'Test', callbackURL: origin });
  assert.equal(signup.status, 200);
  assert.equal((await f.request('sign-in/email', { email: 'tester@example.com', password })).status, 403);
  assert.equal((await f.request('sign-in/email', { email: 'tester@example.com', password: 'wrong' })).status, 401);
  const stored = f.db.prepare('SELECT password FROM patrac_auth_account').get().password;
  assert.notEqual(stored, password); assert.ok(stored.length > 64);
  const link = f.mail[0].text.match(/https?:\/\/\S+/)[0];
  assert.equal((await f.auth.handler(new Request(link))).status, 302);
  const login = await f.request('sign-in/email', { email: 'tester@example.com', password });
  assert.equal(login.status, 200); const token = login.headers.get('set-auth-token'); assert.ok(token);
  assert.equal((await f.auth.api.getSession({ headers: new Headers({ Authorization: 'Bearer ' + token }) })).user.email, 'tester@example.com');
  assert.equal(await f.auth.api.getSession({ headers: new Headers({ Authorization: 'Bearer ' + token + 'x' }) }), null);
  assert.equal((await f.request('sign-out', {}, token)).status, 200);
  assert.equal(await f.auth.api.getSession({ headers: new Headers({ Authorization: 'Bearer ' + token }) }), null);
  f.db.close();
});
test('reset tokens are single-use and password reset invalidates prior sessions', async () => {
  const f = await fixture(), login = await verified(f), token = login.headers.get('set-auth-token');
  const reset = await f.request('request-password-reset', { email: 'tester@example.com', redirectTo: origin + '/?account=recovery' });
  assert.equal(reset.status, 200, await reset.text());
  const link = f.mail.at(-1).text.match(/https?:\/\/\S+/)[0];
  const redirect = await f.auth.handler(new Request(link));
  const resetToken = new URL(redirect.headers.get('location')).searchParams.get('token'); assert.ok(resetToken);
  assert.equal((await f.request('reset-password', { token: resetToken, newPassword: 'new-test-password-7630' })).status, 200);
  assert.equal(await f.auth.api.getSession({ headers: new Headers({ Authorization: 'Bearer ' + token }) }), null);
  assert.notEqual((await f.request('reset-password', { token: resetToken, newPassword: password })).status, 200);
  assert.equal((await f.request('sign-in/email', { email: 'tester@example.com', password: 'new-test-password-7630' })).status, 200);
  f.db.close();
});
test('password changes require the old password; arbitrary callback origins and excessive login attempts are blocked', async () => {
  const f = await fixture(), login = await verified(f), token = login.headers.get('set-auth-token');
  assert.notEqual((await f.request('change-password', { currentPassword: 'wrong', newPassword: 'new-test-password-7630' }, token)).status, 200);
  assert.equal((await f.request('request-password-reset', { email: 'tester@example.com', redirectTo: 'https://evil.example/' })).status, 403);
  assert.equal((await f.request('sign-in/email', { email: 'tester@example.com', password }, null, { Origin: 'https://evil.example' })).status, 403);
  let response; for(let i=0;i<8;i++) response = await f.request('sign-in/email', { email: 'tester@example.com', password: 'wrong' });
  assert.equal(response.status, 429); f.db.close();
});

test('safe delivery error code reaches the browser without credentials or message contents', async () => {
  const f = await fixture(true);
  await f.request('sign-up/email', { email: 'tester@example.com', password, name: 'Test', callbackURL: origin });
  const r = await f.request('send-verification-email', { email: 'tester@example.com', callbackURL: origin });
  assert.equal(r.status, 503);
  const body = await r.json(); assert.equal(body.code, 'MAIL_SIGNATURE_INVALID'); assert.equal(JSON.stringify(body).includes(password), false);
  f.db.close();
});

test('nicknames normalize Unicode, case and whitespace and reject duplicate registrations',async()=>{
 const f=await fixture();
 const create=(email,name)=>f.request('sign-up/email',{email,name,password,callbackURL:origin});
 assert.equal((await create('one@example.com','  ŽLUŤÁK  ')).status,200);
 const duplicate=await create('two@example.com','žluťák');assert.equal(duplicate.status,400);assert.equal((await duplicate.json()).code,'NICKNAME_TAKEN');
 assert.equal(f.db.prepare('SELECT count(*) AS n FROM patrac_auth_user').get().n,1);
 assert.equal(f.db.prepare('SELECT name,nicknameKey FROM patrac_auth_user').get().nicknameKey,'žluťák');
 const parallel=await Promise.all([create('three@example.com','Nový hráč'),create('four@example.com','NOVÝ HRÁČ')]);
 assert.equal(parallel.filter(r=>r.status===200).length,1);
 assert.equal(f.db.prepare('SELECT count(*) AS n FROM patrac_auth_user WHERE nicknameKey=?').get('nový hráč').n,1);
 assert.notEqual((await create('five@example.com','\u200b')).status,200);f.db.close();
});

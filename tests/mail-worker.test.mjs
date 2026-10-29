import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { validMailSignature } from '../app/lib/accountMailSignature.mjs';
test('real Workers runtime sends a signed mail request and refuses to follow redirects', async () => {
  const secret = 'local-mail-test-secret-not-used-in-production';
  const built = await build({ stdin: { contents: `import {sendAccountMail} from './worker/mail.ts'; export default {async fetch() {try {await sendAccountMail('test@example.com','Potvrzení platby – Pátrač','Test',{version:'archiv-1',text:'Původní přijaté podmínky'});return Response.json({ok:true});}catch(e){return Response.json({code:e.body?.code || 'ERROR'},{status:503});}}}`, resolveDir: process.cwd() }, bundle: true, format: 'esm', platform: 'browser', external: ['cloudflare:workers','node:*'], write: false, logLevel: 'silent' });
  let calls = 0, status = 200;
  const mf = new Miniflare({ modules: true, script: built.outputFiles[0].text, compatibilityDate: '2026-05-22', compatibilityFlags: ['nodejs_compat'], cf: false, bindings: { PATRAC_AUTH_SECRET: secret, PATRAC_REGISTRATION_READY: 'true', PATRAC_MAIL_RELAY_URL: 'https://relay.example.test/mail' }, outboundService: async request => {
    calls++; assert.equal(request.url,'https://relay.example.test/mail');
    const text = await request.text();
    assert.deepEqual(JSON.parse(text).terms,{version:'archiv-1',text:'Původní přijaté podmínky'});
    assert.equal(validMailSignature(text, request.headers.get('x-patrac-timestamp'), request.headers.get('x-patrac-signature'), secret), true);
    return new Response(status === 200 ? '{"ok":true}' : '', {status, headers: status === 302 ? {Location:'https://wrong.example.test/'} : {}});
  } });
  try {
    assert.equal((await mf.dispatchFetch('http://localhost/')).status,200); assert.equal(calls,1);
    status=302; const redirect = await mf.dispatchFetch('http://localhost/');
    assert.equal(redirect.status,503); assert.equal((await redirect.json()).code,'RELAY_HTTP_302'); assert.equal(calls,2);
  } finally { await mf.dispose(); }
});

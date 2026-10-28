import { env } from 'cloudflare:workers';
import { allowedOrigin } from './origin.mjs';
import { createExpedition, viewExpedition, changeExpedition, errorResponse } from './lib/patrac-server';
import { adminRequest } from './admin';
import { billingRequest } from './billing';
import { accountAuth } from './auth';
import * as account from './account';
import * as config from './config';
export default {
  async fetch(request: Request): Promise<Response> {
    const origin = request.headers.get('origin');
    if (origin && !allowedOrigin(origin, env.PATRAC_ALLOWED_ORIGINS)) return Response.json({ error: 'Nepovolený původ požadavku.' }, { status: 403 });
    const headers = new Headers({ 'Cache-Control': 'no-store, private', 'Vary': 'Origin, Authorization, X-Patrac-Account', 'X-Content-Type-Options': 'nosniff' });
    if (origin) headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Patrac-Account');
    headers.set('Access-Control-Expose-Headers', 'set-auth-token');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    const path = new URL(request.url).pathname;
    let response: Response;
    try {
      if (path === '/api/billing' || path.startsWith('/api/billing/')) response = await billingRequest(request);
      else if (path.startsWith('/api/admin/')) {
        if (request.method === 'POST' && !origin) return Response.json({error:'Chybí původ požadavku.'},{status:403,headers});
        response = await adminRequest(request);
      }
      else if (path.startsWith('/api/auth/')) {
        if (request.method === 'POST' && !origin) return Response.json({ error: 'Chybí původ požadavku.' }, { status: 403, headers });
        if (env.PATRAC_REGISTRATION_READY !== 'true' && ['/api/auth/sign-up/email', '/api/auth/request-password-reset', '/api/auth/send-verification-email'].includes(path)) return Response.json({ message: 'Odesílání e-mailů se připravuje.' }, { status: 503, headers });
        response = await accountAuth().handler(request);
      }
      else if (path === '/api/account/config' && request.method === 'GET') response = await config.GET();
      else if (path === '/api/account' && request.method === 'GET') response = await account.GET(request);
      else if (path === '/api/account' && request.method === 'POST') response = await account.POST(request);
      else if (path === '/api/expeditions' && request.method === 'POST') response = await createExpedition(request);
      else {
        const match = /^\/api\/expeditions\/([A-Za-z2-9]{7})$/.exec(path);
        if (match && request.method === 'GET') response = await viewExpedition(request, match[1].toUpperCase());
        else if (match && request.method === 'POST') response = await changeExpedition(request, match[1].toUpperCase());
        else response = Response.json({ error: 'Nenalezeno.' }, { status: 404 });
      }
    } catch (e) { response = errorResponse(e); }
    const merged = new Headers(response.headers);
    headers.forEach((value, key) => merged.set(key, value));
    return new Response(response.body, { status: response.status, headers: merged });
  }
};

import {turnstileConfig} from './lib/turnstile.mjs';
import { env } from './runtime';
export async function GET() {
  let playerAccountsReady=false;try{await env.DB!.prepare('SELECT nicknameKey FROM patrac_auth_user LIMIT 0').all();await env.DB!.prepare('SELECT user_id FROM patrac_teams LIMIT 0').all();playerAccountsReady=true;}catch{}
  const protection=turnstileConfig(env);
  return Response.json({ turnstile:{enabled:protection.enabled,siteKey:protection.ready?protection.siteKey:''}, environment:env.PATRAC_STRIPE_MODE==='live'?'live':'test',registrationBonusMonths:env.PATRAC_STRIPE_MODE==='test'?3:0, provider: 'patrac', playerAccountsReady, registrationReady: env.PATRAC_REGISTRATION_READY === 'true' && !!env.PATRAC_AUTH_SECRET && (!protection.enabled||protection.ready) }, { headers: { 'Cache-Control': 'no-store' } });
}

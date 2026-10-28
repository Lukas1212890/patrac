import { env } from './runtime';
export async function GET() {
  let playerAccountsReady=false;try{await env.DB!.prepare('SELECT nicknameKey FROM patrac_auth_user LIMIT 0').all();await env.DB!.prepare('SELECT user_id FROM patrac_teams LIMIT 0').all();playerAccountsReady=true;}catch{}
  return Response.json({ environment:env.PATRAC_STRIPE_MODE==='live'?'live':'test',provider: 'patrac', playerAccountsReady, registrationReady: env.PATRAC_REGISTRATION_READY === 'true' && !!env.PATRAC_AUTH_SECRET }, { headers: { 'Cache-Control': 'no-store' } });
}

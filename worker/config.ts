import { env } from 'cloudflare:workers';
export async function GET() {
  return Response.json({ provider: 'patrac', registrationReady: env.PATRAC_REGISTRATION_READY === 'true' && !!env.PATRAC_AUTH_SECRET }, { headers: { 'Cache-Control': 'no-store' } });
}

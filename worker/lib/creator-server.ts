import { env } from 'cloudflare:workers';
import { GameError } from './patrac-engine.mjs';
import { verifiedCreator } from './creatorIdentity.mjs';
export function authConfig() {
  const url = env.PATRAC_AUTH_URL || '', key = env.PATRAC_AUTH_PUBLISHABLE_KEY || '';
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url) || !key) throw new GameError('Přihlašování se připravuje. Zkuste to později.', 503);
  return { url, key };
}
export async function creatorIdentity(request: Request, required = false) {
  const accessToken = request.headers.get('x-patrac-account');
  if (!accessToken) { if (required) throw new GameError('Pro správu výprav se přihlaste k účtu tvůrce.', 401); return null; }
  if (accessToken.length > 10000 || !/^[A-Za-z0-9_.-]+$/.test(accessToken)) throw new GameError('Přihlášení není platné. Přihlaste se znovu.', 401);
  const { url, key } = authConfig();
  let response: Response;
  try { response = await fetch(url + '/auth/v1/user', { headers: { apikey: key, Authorization: 'Bearer ' + accessToken }, signal: AbortSignal.timeout(10000) }); }
  catch { throw new GameError('Přihlašovací služba neodpovídá. Zkuste to znovu.', 503); }
  if (!response.ok) { if (response.status >= 500) throw new GameError('Přihlašovací služba je dočasně nedostupná.', 503); throw new GameError('Přihlášení vypršelo. Přihlaste se znovu.', 401); }
  const who = verifiedCreator(await response.json());
  if (!who) throw new GameError('Nejprve ověřte svůj e-mail.', 403);
  return who;
}

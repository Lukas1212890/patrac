import { accountAuth } from '../auth';
import { GameError } from './patrac-engine.mjs';
export async function creatorIdentity(request: Request, required = false) {
  const token = request.headers.get('x-patrac-account');
  if (!token) { if (required) throw new GameError('Pro hraní a správu výprav se přihlaste k účtu Pátrače.', 401); return null; }
  if (token.length > 1024 || !/^[A-Za-z0-9_+%/.=-]+$/.test(token)) throw new GameError('Přihlášení není platné.', 401);
  const headers = new Headers({ Authorization: 'Bearer ' + token });
  const session = await accountAuth().api.getSession({ headers });
  if (!session?.user?.emailVerified) throw new GameError('Přihlášení vypršelo nebo e-mail není ověřený.', 401);
  return { id: session.user.id, email: session.user.email, nickname: session.user.name };
}

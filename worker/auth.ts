import { env } from './runtime';
import { createAccountAuth } from './lib/accountAuth.mjs';
import { sendAccountMail } from './mail';
let cached: ReturnType<typeof createAccountAuth> | undefined;
export function accountAuth() {
  if (!env.PATRAC_AUTH_SECRET || env.PATRAC_AUTH_SECRET.length < 32) throw Error('Account service is not configured');
  return cached ||= createAccountAuth({ ...env, sendMail: sendAccountMail });
}

import {GameError} from './patrac-engine.mjs';
export function turnstileConfig(env){const siteKey=env.PATRAC_TURNSTILE_SITE_KEY||'',secret=env.PATRAC_TURNSTILE_SECRET_KEY||'';return {enabled:!!(siteKey||secret),ready:!!(siteKey&&secret),siteKey};}
export async function checkTurnstile(request,env,fetcher=fetch){
 const action={'/api/auth/sign-up/email':'registration','/api/auth/request-password-reset':'password_reset'}[new URL(request.url).pathname.replace(/\/$/,'')];
 if(request.method!=='POST'||!action)return;
 const config=turnstileConfig(env);if(!config.enabled)return;
 if(!config.ready)throw new GameError('Ochrana formuláře se připravuje. Zkuste to později.',503);
 const token=request.headers.get('x-patrac-turnstile');if(!token||token.length>2048)throw new GameError('Potvrďte ověření proti robotům.',403);
 let result;try{const r=await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({secret:env.PATRAC_TURNSTILE_SECRET_KEY,response:token,...(request.headers.get('cf-connecting-ip')?{remoteip:request.headers.get('cf-connecting-ip')}:{})}),signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error();result=await r.json();}catch{throw new GameError('Ověření proti robotům není dostupné. Zkuste to znovu.',503);}
 if(result.success!==true||result.hostname!==(env.PATRAC_TURNSTILE_HOSTNAME||'patrac.stopik.cz')||result.action!==action)throw new GameError('Ověření proti robotům vypršelo nebo neuspělo. Zkuste ho znovu.',403);
}

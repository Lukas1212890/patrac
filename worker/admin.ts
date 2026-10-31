import {adminInbox,readAdminInbox} from './lib/adminInbox.mjs';
import {pushConfig,savePushSubscription,removePushSubscription,testAdminPush} from './lib/adminPush.mjs';
import {GameError} from './lib/patrac-engine.mjs';
import {reportsList,resolveReport,hideReportedComment} from './lib/contentModeration.mjs';
import {expireAttempts} from './lib/expiredAttempts.mjs';
import { env,rawEnv } from './runtime';
import {runtimeModeStatus,changeRuntimeMode} from './lib/runtimeModeAdmin.mjs';
import { accountAuth } from './auth';
import { billingEnvironment } from './lib/billing.mjs';
import { createAdminService, AdminError } from './lib/adminService.mjs';
const APP = 'https://patrac.stopik.cz';
const service = () => createAdminService({
  db: env.DB,
  bucket: env.BUCKET,
  billingMode: env.PATRAC_BILLING_ENABLED === 'true' ? billingEnvironment(env) : '',
  getSession: async (request: Request) => {
    const token = request.headers.get('x-patrac-account');
    if (!token || token.length > 1024) return null;
    return accountAuth().api.getSession({headers:new Headers({Authorization:'Bearer '+token})});
  },
  sendReset: (email: string) => accountAuth().api.requestPasswordReset({body:{email,redirectTo:APP+'/?account=recovery'},headers:new Headers({Origin:APP})}),
  sendVerification: (email: string) => accountAuth().api.sendVerificationEmail({body:{email,callbackURL:APP+'/?account=verified'},headers:new Headers({Origin:APP})}),
});
async function readAdminBody(request: Request) {
  if (!request.headers.get('content-type')?.includes('application/json')) throw new AdminError('Očekáváme JSON.',415);
  const reader=request.body?.getReader();if(!reader)throw new AdminError('Chybí údaje.');
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8192){await reader.cancel();throw new AdminError('Požadavek je příliš velký.',413);}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  let input;try{input=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new AdminError('Neplatné údaje.');}
  if(!input||typeof input!=='object'||Array.isArray(input))throw new AdminError('Neplatné údaje.');return input;
}
export async function adminRequest(request: Request) {
  try {
    const url = new URL(request.url), api = service();
    if(url.pathname==='/api/admin/notices'){
      const actor=(await api.session(request)).user;
      if(request.method==='GET')return Response.json(await adminInbox(env.DB,actor.id,{page:Number(url.searchParams.get('page')||0),notice:url.searchParams.get('notice'),secret:env.PATRAC_AUTH_SECRET}));
      if(request.method==='POST')return Response.json(await readAdminInbox(env.DB,actor.id,await readAdminBody(request)));
    }
    if(url.pathname==='/api/admin/push'){
      const actor=(await api.session(request)).user;
      if(request.method==='GET'){const config=await pushConfig(env.DB,env.PATRAC_AUTH_SECRET);return Response.json({publicKey:config.public_key});}
      if(request.method==='POST'){const input=await readAdminBody(request);if(input.action==='status'){if(typeof input.endpoint!=='string'||input.endpoint.length>2048)throw new GameError('Neplatné zařízení.');return Response.json({enabled:!!await env.DB.prepare('SELECT id FROM patrac_admin_push WHERE user_id=? AND endpoint=?').bind(actor.id,input.endpoint).first()});}if(input.action==='subscribe')return Response.json(await savePushSubscription(env.DB,actor.id,input,env.PATRAC_AUTH_SECRET));if(input.action==='unsubscribe')return Response.json(await removePushSubscription(env.DB,actor.id,input.endpoint));if(input.action==='test')return Response.json(await testAdminPush(env.DB,env.PATRAC_AUTH_SECRET,actor.id,input.endpoint));throw new GameError('Neplatná akce.');}
    }
    if(url.pathname==='/api/admin/reports'){const actor=(await api.session(request,request.method==='POST')).user;if(request.method==='GET')return Response.json(await reportsList(env.DB,{status:url.searchParams.get('status')||'pending',environment:url.searchParams.get('environment')||'all',page:Number(url.searchParams.get('page')||0)}));if(request.method==='POST'){const input=await readAdminBody(request);return Response.json(input.action==='hide-comment'?await hideReportedComment({db:env.DB,actor,input}):await resolveReport(env.DB,input,Date.now(),actor.id));}}
    if(url.pathname==='/api/admin/runtime-mode'){
      const actor=(await api.session(request,request.method==='POST')).user;
      if(request.method==='GET')return Response.json(await runtimeModeStatus(env.DB,rawEnv));
      if(request.method==='POST')return Response.json(await changeRuntimeMode({db:env.DB,raw:rawEnv,actor,input:await readAdminBody(request)}));
    }
    if (url.pathname.startsWith('/api/admin/users/') || (url.pathname==='/api/admin/users' && request.method==='POST')) { await api.session(request); await expireAttempts(env.DB); }
    if (request.method === 'GET' && url.pathname === '/api/admin/session') return Response.json(await api.session(request));
    if (request.method === 'GET' && url.pathname === '/api/admin/users') return Response.json(await api.list(request,{q:url.searchParams.get('q')||'',page:url.searchParams.get('page')||'0',status:url.searchParams.get('status')||'all',source:url.searchParams.get('source')||'all',months:url.searchParams.get('months')||'all',ending:url.searchParams.get('ending')||'all'}));
    const expeditionMatch=/^\/api\/admin\/users\/([^/]+)\/expeditions\/([^/]+)$/.exec(url.pathname);
    if(request.method==='GET'&&expeditionMatch){const photo=url.searchParams.has('station')?[Number(url.searchParams.get('station')),Number(url.searchParams.get('hint'))]:null;return Response.json(await api.expedition(request,decodeURIComponent(expeditionMatch[1]),decodeURIComponent(expeditionMatch[2]),photo));}
    const previewMatch=/^\/api\/admin\/users\/([^/]+)\/access-preview$/.exec(url.pathname);
    if(request.method==='GET'&&previewMatch)return Response.json(await api.previewAccess(request,decodeURIComponent(previewMatch[1]),url.searchParams.get('grant')||''));
    if (request.method === 'GET' && url.pathname.startsWith('/api/admin/users/')) return Response.json(await api.detail(request,decodeURIComponent(url.pathname.slice('/api/admin/users/'.length))));
    if (request.method === 'POST' && url.pathname === '/api/admin/users') { await api.session(request); return Response.json(await api.change(request,await readAdminBody(request))); }
    return Response.json({error:'Nenalezeno.'},{status:404});
  } catch (error) {
    if (error instanceof AdminError || error instanceof GameError) return Response.json({error:error.message,code:(error as any).code},{status:error.status});
    return Response.json({error:'Administrace je dočasně nedostupná.'},{status:503});
  }
}

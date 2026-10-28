import {expireAttempts} from './lib/expiredAttempts.mjs';
import { env } from 'cloudflare:workers';
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
    if (url.pathname.startsWith('/api/admin/users/') || (url.pathname==='/api/admin/users' && request.method==='POST')) { await api.session(request); await expireAttempts(env.DB); }
    if (request.method === 'GET' && url.pathname === '/api/admin/session') return Response.json(await api.session(request));
    if (request.method === 'GET' && url.pathname === '/api/admin/users') return Response.json(await api.list(request,{q:url.searchParams.get('q')||'',page:url.searchParams.get('page')||'0'}));
    if (request.method === 'GET' && url.pathname.startsWith('/api/admin/users/')) return Response.json(await api.detail(request,decodeURIComponent(url.pathname.slice('/api/admin/users/'.length))));
    if (request.method === 'POST' && url.pathname === '/api/admin/users') { await api.session(request); return Response.json(await api.change(request,await readAdminBody(request))); }
    return Response.json({error:'Nenalezeno.'},{status:404});
  } catch (error) {
    if (error instanceof AdminError) return Response.json({error:error.message,code:error.code},{status:error.status});
    return Response.json({error:'Administrace je dočasně nedostupná.'},{status:503});
  }
}

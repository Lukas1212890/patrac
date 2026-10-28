import {env as bindings} from 'cloudflare:workers';
import {AsyncLocalStorage} from 'node:async_hooks';
import {modeEnv,readRuntimeMode} from './lib/runtimeMode.mjs';
const context=new AsyncLocalStorage<Cloudflare.Env>();
export const rawEnv=bindings;
export const env=new Proxy(bindings,{get(target,key){return Reflect.get(context.getStore()||target,key);}});
export async function withRuntime<T>(callback:()=>Promise<T>):Promise<T>{
 const state=await readRuntimeMode(bindings.DB,bindings.PATRAC_STRIPE_MODE);
 const effective=modeEnv(bindings,state.mode);
 if(state.ready)effective.PATRAC_BILLING_ENABLED='true';
 return context.run(effective as Cloudflare.Env,callback);
}

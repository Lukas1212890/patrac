'use client';
import {apiUrl} from './apiUrl.mjs';
import {creatorAccessToken} from './creator-client';
export async function publicRequest(path,data,signal){
 const token=await creatorAccessToken();
 const response=await fetch(apiUrl('/api/public'+path),{method:data?'POST':'GET',cache:'no-store',signal:signal||AbortSignal.timeout(20000),headers:{...(token?{'X-Patrac-Account':token}:{}),...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})});
 let result;try{result=await response.json();}catch{throw Error('Server nevrátil odpověď. Zkuste to znovu.');}
 if(!response.ok)throw Object.assign(Error(result.error||'Výpravu se nepodařilo načíst.'),{status:response.status});return result;
}
export const publicTime=ms=>{const seconds=Math.floor(Math.max(0,ms||0)/1000);return[Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(v=>String(v).padStart(2,'0')).join(':');};
export const difficulties={easy:'Lehká',medium:'Střední',hard:'Náročná'};

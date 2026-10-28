'use client';
import {useEffect,useState,useCallback} from 'react';
import {creatorAccessToken} from '../lib/creator-client';
import {apiUrl} from '../lib/apiUrl.mjs';
export default function useCreatorNotices(userId){
 const [state,setState]=useState({userId:null,notices:[],loading:true,error:''});
 const refresh=useCallback(()=>window.dispatchEvent(new Event('patrac-notices-refresh')),[]);
 useEffect(()=>{if(!userId){setState({userId:null,notices:[],loading:false,error:''});return;}setState(old=>old.userId===userId?{...old,loading:true,error:''}:{userId,notices:[],loading:true,error:''});let live=true,controller,previous='';
  async function load(){controller?.abort();const current=new AbortController();controller=current;try{const token=await creatorAccessToken();if(!live)return;const response=await fetch(apiUrl('/api/account/notices'),{headers:{'X-Patrac-Account':token||''},cache:'no-store',signal:AbortSignal.any([current.signal,AbortSignal.timeout(15000)])});if(!response.ok)throw Error();const result=await response.json();if(!live||current.signal.aborted)return;setState({userId,notices:result.notices,loading:false,error:''});const ids=result.notices.map(n=>n.id).join(',');if(ids!==previous){previous=ids;window.dispatchEvent(new Event('patrac-expeditions-changed'));}}catch(error){if(live&&!current.signal.aborted)setState(old=>({userId,notices:old.userId===userId?old.notices:[],loading:false,error:'Oznámení se nepodařilo načíst. Zkuste je obnovit.'}));}}
  load();const refresh=()=>{if(!document.hidden)load();},timer=setInterval(refresh,60000);window.addEventListener('online',refresh);window.addEventListener('patrac-notices-refresh',refresh);document.addEventListener('visibilitychange',refresh);return()=>{live=false;controller?.abort();clearInterval(timer);window.removeEventListener('online',refresh);window.removeEventListener('patrac-notices-refresh',refresh);document.removeEventListener('visibilitychange',refresh);};
 },[userId]);
 return state.userId===userId?{...state,refresh}:{notices:[],loading:!!userId,error:'',refresh};
}

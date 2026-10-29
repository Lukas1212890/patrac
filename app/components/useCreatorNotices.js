'use client';
import {useEffect,useState,useCallback,useRef} from 'react';
import {creatorAccessToken} from '../lib/creator-client';
import {noticeStorageKey,noticeReadId,parseNoticeReads,mergeNoticeReads,unreadNotices} from '../lib/noticeReadState.mjs';
import {installNoticeRefresh} from '../lib/noticeRefresh.mjs';
import {apiUrl} from '../lib/apiUrl.mjs';
async function saveReads(readIds,signal){
 const token=await creatorAccessToken();
 const response=await fetch(apiUrl('/api/account/notices/read'),{method:'POST',headers:{'X-Patrac-Account':token||'','Content-Type':'application/json'},body:JSON.stringify({readIds}),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('Přečtení se nepodařilo uložit. Zkuste to znovu.');
 return response.json();
}
export default function useCreatorNotices(userId){
 const activeUser=useRef(userId);activeUser.current=userId;
 const [savingFor,setSavingFor]=useState(null);
 const [state,setState]=useState({userId:null,notices:[],loading:true,error:''});
 const [readState,setReadState]=useState({userId:null,ids:[]});
 useEffect(()=>{if(!userId){setReadState({userId:null,ids:[]});return;}const key=noticeStorageKey(userId);
  try{setReadState({userId,ids:parseNoticeReads(localStorage.getItem(key))});}catch{setReadState({userId,ids:[]});}
  const sync=event=>{if(event.key===key)setReadState({userId,ids:parseNoticeReads(event.newValue)});};window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync);
 },[userId]);
 const cacheReads=useCallback(ids=>{
  if(activeUser.current!==userId)return;
  let stored=[];try{stored=parseNoticeReads(localStorage.getItem(noticeStorageKey(userId)));}catch{}
  const next=mergeNoticeReads(stored,ids);
  setReadState(old=>({userId,ids:mergeNoticeReads(old.userId===userId?old.ids:[],next)}));
  try{localStorage.setItem(noticeStorageKey(userId),JSON.stringify(next));}catch{}
 },[userId]);
 const markRead=useCallback(async ids=>{
  if(!userId||state.userId!==userId||savingFor===userId)return;
  const requested=new Set(ids),keys=state.notices.filter(n=>requested.has(n.id)).map(noticeReadId);
  if(!keys.length)return;
  setSavingFor(userId);
  try{const result=await saveReads(keys);if(activeUser.current!==userId)return;cacheReads(result.readIds);setState(old=>({...old,error:''}));}
  catch{if(activeUser.current===userId)setState(old=>({...old,error:'Přečtení se nepodařilo uložit. Zkontrolujte připojení a zkuste to znovu.'}));}
  finally{setSavingFor(old=>old===userId?null:old);}
 },[userId,state.userId,state.notices,savingFor,cacheReads]);
 const refresh=useCallback(()=>window.dispatchEvent(new Event('patrac-notices-refresh')),[]);
 useEffect(()=>{if(!userId){setState({userId:null,notices:[],loading:false,error:''});return;}setState(old=>old.userId===userId?{...old,loading:true,error:''}:{userId,notices:[],loading:true,error:''});let live=true,controller,previous='';
  async function load(){controller?.abort();const current=new AbortController();controller=current;try{const token=await creatorAccessToken();if(!live)return;const response=await fetch(apiUrl('/api/account/notices?format=3'),{headers:{'X-Patrac-Account':token||''},cache:'no-store',signal:AbortSignal.any([current.signal,AbortSignal.timeout(15000)])});if(!response.ok)throw Error();const result=await response.json();if(!live||current.signal.aborted)return;
   let stored=[];try{stored=parseNoticeReads(localStorage.getItem(noticeStorageKey(userId)));}catch{}
   const serverReads=result.readIds||[],serverSet=new Set(serverReads),localSet=new Set(stored);
   const pending=result.notices.map(noticeReadId).filter(id=>localSet.has(id)&&!serverSet.has(id));
   let syncError='';
   try{if(pending.length){const saved=await saveReads(pending,current.signal);serverReads.push(...saved.readIds);}}catch{syncError='Dříve přečtená oznámení se nepodařilo synchronizovat. Zkuste je obnovit.';}
   if(!live||current.signal.aborted)return;
   cacheReads(serverReads);
   setState({userId,notices:result.notices,loading:false,error:syncError});const ids=result.notices.map(n=>n.id).join(',');if(ids!==previous){previous=ids;window.dispatchEvent(new Event('patrac-expeditions-changed'));}}catch(error){if(live&&!current.signal.aborted)setState(old=>({userId,notices:old.userId===userId?old.notices:[],loading:false,error:'Oznámení se nepodařilo načíst. Zkuste je obnovit.'}));}}
  load();const stop=installNoticeRefresh(window,document,userId,load);return()=>{live=false;controller?.abort();stop();};
 },[userId,cacheReads]);
 const current=state.userId===userId?state:{notices:[],loading:!!userId,error:''};
 const unread=unreadNotices(current.notices,readState.userId===userId?readState.ids:[]);
 return{...current,saving:savingFor===userId,refresh,markRead,unreadNotices:unread,unreadCount:unread.length};
}

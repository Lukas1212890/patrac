'use client';
import {useEffect,useState,useCallback} from 'react';
import {creatorAccessToken} from '../lib/creator-client';
import {noticeStorageKey,noticeReadId,parseNoticeReads,mergeNoticeReads,unreadNotices} from '../lib/noticeReadState.mjs';
import {installNoticeRefresh} from '../lib/noticeRefresh.mjs';
import {apiUrl} from '../lib/apiUrl.mjs';
export default function useCreatorNotices(userId){
 const [state,setState]=useState({userId:null,notices:[],loading:true,error:''});
 const [readState,setReadState]=useState({userId:null,ids:[]});
 useEffect(()=>{if(!userId){setReadState({userId:null,ids:[]});return;}const key=noticeStorageKey(userId);
  try{setReadState({userId,ids:parseNoticeReads(localStorage.getItem(key))});}catch{setReadState({userId,ids:[]});}
  const sync=event=>{if(event.key===key)setReadState({userId,ids:parseNoticeReads(event.newValue)});};window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync);
 },[userId]);
 const markRead=useCallback(ids=>{if(!userId||state.userId!==userId)return;const requested=new Set(ids),keys=state.notices.filter(n=>requested.has(n.id)).map(noticeReadId);let stored=[];try{stored=parseNoticeReads(localStorage.getItem(noticeStorageKey(userId)));}catch{}
  const next=mergeNoticeReads(mergeNoticeReads(readState.userId===userId?readState.ids:[],stored),keys);setReadState({userId,ids:next});try{localStorage.setItem(noticeStorageKey(userId),JSON.stringify(next));}catch{}
 },[userId,state.userId,state.notices,readState]);
 const refresh=useCallback(()=>window.dispatchEvent(new Event('patrac-notices-refresh')),[]);
 useEffect(()=>{if(!userId){setState({userId:null,notices:[],loading:false,error:''});return;}setState(old=>old.userId===userId?{...old,loading:true,error:''}:{userId,notices:[],loading:true,error:''});let live=true,controller,previous='';
  async function load(){controller?.abort();const current=new AbortController();controller=current;try{const token=await creatorAccessToken();if(!live)return;const response=await fetch(apiUrl('/api/account/notices?format=3'),{headers:{'X-Patrac-Account':token||''},cache:'no-store',signal:AbortSignal.any([current.signal,AbortSignal.timeout(15000)])});if(!response.ok)throw Error();const result=await response.json();if(!live||current.signal.aborted)return;setState({userId,notices:result.notices,loading:false,error:''});const ids=result.notices.map(n=>n.id).join(',');if(ids!==previous){previous=ids;window.dispatchEvent(new Event('patrac-expeditions-changed'));}}catch(error){if(live&&!current.signal.aborted)setState(old=>({userId,notices:old.userId===userId?old.notices:[],loading:false,error:'Oznámení se nepodařilo načíst. Zkuste je obnovit.'}));}}
  load();const stop=installNoticeRefresh(window,document,userId,load);return()=>{live=false;controller?.abort();stop();};
 },[userId]);
 const current=state.userId===userId?state:{notices:[],loading:!!userId,error:''};
 const unread=unreadNotices(current.notices,readState.userId===userId?readState.ids:[]);
 return{...current,refresh,markRead,unreadNotices:unread,unreadCount:unread.length};
}

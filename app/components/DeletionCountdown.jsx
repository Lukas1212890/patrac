'use client';
import {useEffect,useState} from 'react';
export default function DeletionCountdown({at}){
 const [now,setNow]=useState(null);
 useEffect(()=>{setNow(Date.now());const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
 if(!at)return null;
 const seconds=now===null?null:Math.max(0,Math.ceil((at-now)/1000));
 return <span>{seconds===null?'Načítám odpočet smazání…':seconds===0?'Čeká na odstranění':'Smazání za '+Math.floor(seconds/3600)+' h '+Math.floor(seconds%3600/60)+' min '+seconds%60+' s'}</span>;
}

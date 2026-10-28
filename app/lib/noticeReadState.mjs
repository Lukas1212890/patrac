export const noticeStorageKey=userId=>'patrac-dismissed-notices:'+userId;
export const noticeReadId=notice=>notice.type==='delete-expedition'?notice.id:'typed-v2:'+notice.id;
export function parseNoticeReads(value){try{const ids=JSON.parse(value);return Array.isArray(ids)?ids.filter(id=>typeof id==='string').slice(-250):[];}catch{return[];}}
export const mergeNoticeReads=(previous,added)=>[...new Set([...previous,...added])].slice(-250);
export const unreadNotices=(notices,read)=>{const ids=new Set(read);return notices.filter(notice=>!ids.has(noticeReadId(notice)));};

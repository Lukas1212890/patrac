export default function NoticeBadge({count=0}){
 if(count<=0)return null;
 return <span className="p-notice-count" aria-label={count+' nepřečtených oznámení'}>{count>99?'99+':count}</span>;
}

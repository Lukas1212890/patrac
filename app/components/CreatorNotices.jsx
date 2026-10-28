'use client';
import CreatorNoticeCard from './CreatorNoticeCard';
export default function CreatorNotices({notices,onOpenProfile,onRead}){
 const notice=notices[0];if(!notice)return null;
 return <section className="p-creator-notices" data-patrac-pan="true" role="status" aria-label="Nové oznámení účtu"><CreatorNoticeCard notice={notice}/><div><button type="button" className="p-text-button" onClick={onOpenProfile}>Všechna oznámení v profilu</button><button type="button" className="p-secondary" onClick={()=>onRead([notice.id])}>Rozumím</button></div></section>;
}

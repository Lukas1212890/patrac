'use client';
import CreatorNoticeCard from './CreatorNoticeCard';
export default function CreatorNotices({notices,onOpenProfile,onRead,saving=false,error=''}){
 const notice=notices[0];if(!notice)return null;
 return <section className="p-creator-notices" data-patrac-pan="true" role="status" aria-label="Nové oznámení účtu"><CreatorNoticeCard notice={notice}/>{error&&<p className="p-alert" role="alert">{error}</p>}<div><button type="button" className="p-text-button" onClick={onOpenProfile}>Všechna oznámení v profilu</button><button type="button" className="p-secondary" disabled={saving} onClick={()=>onRead([notice.id])}>{saving?'Ukládám…':'Rozumím'}</button></div></section>;
}

export const ADMIN_SECTIONS=['menu','events','players','push','runtime','reports'];
export function readAdminNavigation(href){
 const url=new URL(href,'https://patrac.stopik.cz'),id=url.searchParams.get('notice');
 const notice=id&&/^(registration|payment):[A-Za-z0-9_-]{1,128}$/.test(id)?id:null;
 const section=notice?'events':ADMIN_SECTIONS.includes(url.hash.slice(1))?url.hash.slice(1):'menu';
 return{section,notice};
}
export function adminNavigationURL(section,href,notice){
 const url=new URL(href,'https://patrac.stopik.cz');url.pathname='/admin';
 const target=ADMIN_SECTIONS.includes(section)?section:'menu';
 if(target!=='events')url.searchParams.delete('notice');else if(notice)url.searchParams.set('notice',notice);
 url.hash=target==='menu'?'':target;
 return url.pathname+url.search+url.hash;
}

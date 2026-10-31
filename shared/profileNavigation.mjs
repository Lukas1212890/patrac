export const PROFILE_SECTIONS=['menu','notifications','billing','details','password','info','delete'];
export function profileSectionFromURL(href){
 const url=new URL(href,'https://patrac.stopik.cz');
 if(['success','cancel'].includes(url.searchParams.get('billing')))return 'billing';
 const section=url.hash.startsWith('#profile/')?url.hash.slice(9):'';
 return PROFILE_SECTIONS.includes(section)?section:'menu';
}
export function profileNavigationURL(section,href){
 const url=new URL(href,'https://patrac.stopik.cz');url.pathname='/';url.searchParams.set('account','profile');
 const target=PROFILE_SECTIONS.includes(section)?section:'menu';
 if(target!=='billing')url.searchParams.delete('billing');
 url.hash=target==='menu'?'':'profile/'+target;
 return url.pathname+url.search+url.hash;
}

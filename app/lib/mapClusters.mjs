// Group by rendered screen distance, so the 44px touch targets do not overlap.
export function clusterMapPoints(items,projectPoint,radius=44){
 const groups=[...items].sort((a,b)=>a.code.localeCompare(b.code)).map(item=>({...projectPoint(item),items:[item]}));
 while(true){
  let pair=null,nearest=radius*radius;
  for(let i=0;i<groups.length;i++)for(let j=i+1;j<groups.length;j++){
   const distance=(groups[i].x-groups[j].x)**2+(groups[i].y-groups[j].y)**2;
   if(distance<nearest){nearest=distance;pair=[i,j];}
  }
  if(!pair)break;
  const [i,j]=pair,a=groups[i],b=groups[j],count=a.items.length+b.items.length;
  groups[i]={x:(a.x*a.items.length+b.x*b.items.length)/count,y:(a.y*a.items.length+b.y*b.items.length)/count,items:[...a.items,...b.items]};groups.splice(j,1);
 }
 return groups.map(group=>({...group,key:group.items.map(item=>item.code).sort().join(':')}));
}
export function clusterNeedsList(items,zoom,maxZoom){
 return zoom>=maxZoom||items.every(item=>Math.abs(item.lat-items[0].lat)<0.000001&&Math.abs(item.lng-items[0].lng)<0.000001);
}

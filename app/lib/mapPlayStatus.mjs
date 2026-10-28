const statuses={
 completed:{symbol:'✓',label:'Dokončeno',className:'is-completed'},
 abandoned:{symbol:'×',label:'Ukončeno bez dokončení',className:'is-abandoned'},
};
export function mapPlayStatus(status){return statuses[status]||{symbol:'✦',label:'Veřejná výprava',className:''};}

export const MAP_FILTER_GROUPS=['available','abandoned','completed'];
export const mapFilterGroup=status=>status==='completed'||status==='abandoned'?status:'available';
export const filterMapExpeditions=(items,selected)=>items.filter(item=>selected.includes(mapFilterGroup(item.playStatus)));
export function parseMapFilters(value){try{const parsed=JSON.parse(value);return Array.isArray(parsed)&&parsed.every(x=>MAP_FILTER_GROUPS.includes(x))?[...new Set(parsed)]:[...MAP_FILTER_GROUPS];}catch{return [...MAP_FILTER_GROUPS];}}

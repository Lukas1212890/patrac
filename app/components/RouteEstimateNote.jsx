'use client';
export default function RouteEstimateNote({info}){
 if(!info)return null;
 return <p className="p-small p-route-estimate-note">Délka je součtem vzdáleností mezi stanovišti vzdušnou čarou, od startu do cíle. Cesta k prvnímu stanovišti není zahrnuta. Skutečná cesta může být delší. {info.timeEstimateSource==='author'?<strong>Časový odhad podle správce.</strong>:<>Automatický časový odhad počítá se vzdáleností vzdušnou čarou, chůzí 4 km/h a 5 minutami na každou hádanku. Je zaokrouhlen nahoru na 5 minut.</>}</p>;
}

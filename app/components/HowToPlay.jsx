'use client';
import {MAX_STATIONS} from '../lib/patrac-engine.mjs';
import {useEffect,useRef} from 'react';
export default function HowToPlay({onClose}){
 const panel=useRef(null),close=useRef(onClose);close.current=onClose;
 useEffect(()=>{
  const previous=document.activeElement,overflow=document.body.style.overflow;
  document.body.style.overflow='hidden';panel.current?.querySelector('button')?.focus();
  function key(event){
   if(event.key==='Escape')close.current();
   if(event.key==='Tab'){
    const items=panel.current?.querySelectorAll('button,summary');if(!items?.length)return;
    const first=items[0],last=items[items.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
   }
  }
  document.addEventListener('keydown',key);
  return()=>{document.removeEventListener('keydown',key);document.body.style.overflow=overflow;previous?.focus?.();};
 },[]);
 return <div className="p-modal-backdrop"><section ref={panel} className="p-modal p-how-to" role="dialog" aria-modal="true" aria-labelledby="p-help-title">
 <button type="button" className="p-text-button" onClick={onClose} aria-label="Zavřít návod">Zavřít ×</button>
 <span className="p-kicker">JAK SE HRAJE</span><h2 id="p-help-title">Dojdi na místo. Vyřeš hádanku. Pokračuj dál.</h2>
 <p>Pátrač je venkovní hra s telefonem. Od stanoviště ke stanovišti tě vedou souřadnice a hádanky. Nepotřebuješ QR karty ani nic skenovat — příchod ověří GPS.</p>
 <ol>
 <li><strong>Vyber si výpravu.</strong> Veřejnou najdeš na mapě. K soukromé se připojíš přes „Zahájit soukromou výpravu“ zadáním kódu od jejího tvůrce.</li>
 <li><strong>Dojdi na začátek.</strong> U veřejné výpravy zvol „Přejít na start“. První souřadnice můžeš najít pomocí kompasu, mapy nebo tlačítka „Navigovat“.</li>
 <li><strong>Zahaj hru.</strong> U veřejné výpravy začne čas až po potvrzení „Zahájit hru“. Samotný příchod na start čas nespustí. Pokud začneš dřív, započítá se i cesta k prvnímu stanovišti.</li>
 <li><strong>Vyřeš hádanku na místě.</strong> Jakmile GPS potvrdí příchod, odemkne se hádanka. Pokud tvůrce přidal příběh nebo popisek, uvidíš ho nejdřív. Správná odpověď zpřístupní další stanoviště.</li>
 <li><strong>Dojdi do cíle.</strong> Poslední správnou odpovědí výpravu dokončíš. V závodu rozhoduje výsledný čas včetně penalizací. V soukromé honbě za pokladem může v cíli čekat opravdový poklad připravený tvůrcem.</li>
 </ol>
 <details><summary><strong>Jak vytvořit vlastní výpravu — krok za krokem</strong></summary>
 <p>Přihlas se k účtu s aktivním přístupem a dole otevři <strong>„Tvořit“</strong>. U každého typu uvidíš, kolik výprav ještě můžeš vytvořit.</p>
 <ol>
 <li><strong>Vyber typ výpravy.</strong> Zvol „Vytvořit soukromou výpravu“ pro hraní přes kód, nebo „Vytvořit veřejnou výpravu“ pro ostatní předplatitele na mapě. U veřejné si přečti a potvrď informace pro tvůrce.</li>
 <li><strong>Pojmenuj výpravu a nastav režim.</strong> Veřejná je vždy závod na čas; doplň také popis pro hráče a obtížnost. U soukromé vyber závod na čas, nebo hon za pokladem. Pokud chceš skutečný poklad, připravíš a schováš ho sám na bezpečném místě.</li>
 <li><strong>Přidej první stanoviště.</strong> Vyplň název místa a souřadnice. Můžeš je napsat ručně, použít „Vybrat na mapě“, nebo přímo na místě „Použít moji polohu“. Nastav vzdálenost pro odemčení hádanky; výchozí doporučení je 25 metrů. První stanoviště bude začátkem trasy.</li>
 <li><strong>Napiš hádanku a správnou odpověď.</strong> Více uznávaných odpovědí dej na samostatné řádky. Velikost písmen a diakritika nerozhodují. Volitelný „Popisek po příchodu“ hráči ukáže příběh místa před hádankou.</li>
 <li><strong>Připrav pomoc pro hráče.</strong> V závodu můžeš přidat až 5 textových nebo fotografických nápověd ke stanovišti. U každé vyber penalizaci 5 až 30 minut po pěti minutách. Samostatně nastav penalizaci za zobrazení řešení — hráči se ukáže první správná odpověď. V honbě za pokladem se nápovědy ani řešení nezobrazují.</li>
 <li><strong>Ulož stanoviště a pokračuj.</strong> Dole stiskni „Uložit stanoviště“, pak „Přidat další stanoviště“. Takto připravíš až {MAX_STATIONS} míst. Pořadí změníš šipkami, nepotřebné stanoviště odstraníš košem. U jediného stanoviště koš vymaže jeho údaje.</li>
 <li><strong>Zkontroluj celou trasu.</strong> Aplikace spočítá vzdálenost vzdušnou čarou a časový odhad. Můžeš zadat vlastní odhad správce, nejvýše 24 hodin. Do „Závěrečné gratulace“ můžeš napsat vlastní zakončení, které se ukáže po poslední správné odpovědi. Ověř, že jsou místa bezpečně přístupná a všechny hádanky řešitelné.</li>
 <li><strong>Vytvoř celou výpravu.</strong> Stiskni „Vytvořit výpravu“. Samotné „Uložit stanoviště“ ukládá pouze rozpracovaný koncept v tomto zařízení — ještě nevytvoří hotovou hru na serveru. Při pozdější úpravě použij „Uložit změny“.</li>
 <li><strong>Pozvi hráče.</strong> U veřejné výpravy stiskni nahoře „Zveřejnit na mapě“. Teprve potom ji ostatní najdou na mapě. U soukromé předej hráčům kód; po jejich připojení výpravu spusť.</li>
 </ol>
 <p>Hotové výpravy spravuješ v <strong>„Moje hry“</strong>. Můžeš sledovat postup hráčů a použití nápověd. Dokud někdo výpravu aktivně hraje, úprava, skrytí a běžné smazání jsou uzamčené. Zadané smazání má odklad 72 hodin, během kterého výprava zůstává dostupná a ukazuje odpočet.</p>
 </details>
 <details open><summary><strong>Účet a předplatné</strong></summary><p>Ke hraní potřebuješ ověřený účet s jedinečnou přezdívkou. Účet je pro osoby od 18 let; děti mohou hrát s dospělým pod jeho účtem a dohledem. Můžeš vyrazit sám nebo společně s ostatními pod jedním účtem — samostatný tým se nevytváří.</p><p>Soukromé výpravy hraješ s účtem bez předplatného. Pro veřejné výpravy a tvorbu vlastních potřebuješ aktivní přístup. Placený přístup se automaticky neobnovuje.</p></details>
 <details><summary><strong>Veřejná, nebo soukromá výprava?</strong></summary><p><strong>Veřejná:</strong> najdeš ji na mapě a soutěžíš na čas. Před startem si prohlédni popis, počet stanovišť, odhad délky a hodnocení. Vzdálenost se počítá vzdušnou čarou, skutečná cesta může být delší. Každý účet má na danou veřejnou výpravu jediný pokus.</p><p><strong>Soukromá:</strong> kód ti dá tvůrce. Po připojení čekáš, až výpravu spustí. Může jít o závod na čas nebo honbu za pokladem. Dokončením jednoho hráče výprava nezmizí — může sloužit dalším hráčům.</p></details>
 <details><summary><strong>Navigace, kompas a GPS</strong></summary><p>Povol přístup k poloze. Pokud to telefon vyžaduje, zapni kompas a povol pohyb a orientaci. Středová šipka ukazuje předek telefonu; značka cíle na kompasu ukazuje, kterým směrem se vydat. Pod kompasem vidíš vzdálenost vzdušnou čarou.</p><p>Přes „Navigovat“ můžeš otevřít Stopíkovu navigaci, Mapy.com nebo Google Maps. Po návratu na místo přepni zpět do Pátrače, aby mohl ověřit GPS. Hádanka se otevře až dostatečně blízko stanoviště a při dostatečně přesné poloze. Potřebuješ internet; při nepřesné GPS chvíli počkej na otevřeném místě.</p><p>Kompas a spojnice k cíli neukazují bezpečnou pěší trasu. Sleduj okolí, respektuj soukromé pozemky a drž se přístupných cest.</p></details>
 <details><summary><strong>Nápovědy, řešení a výsledný čas</strong></summary><p>Pokud si nevíš rady, můžeš v závodu použít připravenou nápovědu nebo zobrazit řešení. Nápovědy mohou obsahovat i fotografie. Před použitím uvidíš časovou penalizaci zvolenou tvůrcem — 5, 10, 15, 20, 25 nebo 30 minut. Zobrazené řešení je potřeba zadat jako odpověď.</p><p>Výsledný čas = čas od startu do dokončení + penalizace. Počítá se i chůze mezi stanovišti. První příchozí proto nemusí vyhrát. V honbě za pokladem se nápovědy a řešení nepoužívají.</p></details>
 <details><summary><strong>Přerušení hry a jediný pokus</strong></summary><p>Zavření aplikace ani přechod na mapu čas nezastaví. Rozehranou výpravu najdeš v „Moje hry“; pod stejným účtem můžeš pokračovat i na jiném zařízení.</p><p>U veřejné výpravy je „Ukončit výpravu“ definitivní: pokus bude nedokončený a stejnou výpravu už znovu nezahájíš. Po 48 hodinách od startu se nedohraný pokus automaticky ukončí. Na mapě rozeznáš dokončené a nedokončené výpravy a tlačítkem „Filtr“ vybereš, které chceš zobrazit.</p></details>
 <details><summary><strong>Žebříčky, hodnocení a vlastní výpravy</strong></summary><p>U veřejné výpravy najdeš TOP 10 výsledků. Můžeš jí dát hvězdičky a napsat komentář; tvůrce na něj může odpovědět. O reakcích se dozvíš v oznámeních v profilu.</p><p>V „Žebříčcích“ najdeš výpravy, nejaktivnější hráče i své výsledky. U nejaktivnějších rozhoduje počet dokončených výprav; při shodě je výš ten, kdo tohoto počtu dosáhl dříve.</p><p>V sekci „Tvořit“ připravíš vlastní stanoviště, hádanky, fotografie a nápovědy. Základní limit je 3 soukromé a 2 veřejné výpravy; správce může nastavit individuální limit. Veřejnou výpravu po dokončení přípravy zveřejni na mapě. Za každých 100 započítaných dokončení jedné tvé veřejné výpravy jinými hráči získáš 2 měsíce přístupu zdarma.</p></details>
 <button type="button" className="p-primary" onClick={onClose}>Rozumím, jdeme na to</button>
 </section></div>;
}

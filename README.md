# Pátrač

Samostatná hra: GitHub, Next.js/Vercel, Cloudflare Workers/D1/R2 a SMTP ACTIVE24. Účty tvůrců zajišťuje Better Auth přímo v našem API a D1. Žádná hostovaná autentizační služba. Stopař zůstává oddělený.

## Aktuální provoz

Frontend: `https://patrac-lukasbednariks-3292s-projects.vercel.app`
API: `https://patrac-api.bednarik.workers.dev`
D1: `patra`, ID `2854f53b-4640-4aad-8089-343f5b954a97`, binding `DB`.
R2: `patrac-photos`, binding `BUCKET`.

## Vlastní účty – dokončení konfigurace

Tato změna vyžaduje konfiguraci před aktivací registrace:

1. Do D1 `patra` přidat tabulky z `drizzle/0002_creator_auth.sql` (idempotentní SQL). Existující herní tabulky ani výpravy nemazat. Nevkládat nic do databází Stopaře.
2. Vytvořit náhodný tajný klíč alespoň 32 bajtů. Nastavit stejnou hodnotu jako `PATRAC_AUTH_SECRET` v Cloudflare Worker Secrets a Vercel Environment Variables. Nikdy jej nevkládat do zdrojů, logů ani chatu. Slouží pro podpis relací i ověření požadavků na e-maily; jeho změna odhlásí uživatele.
3. Pouze ve Vercelu nastavit `PATRAC_SMTP_PASSWORD` na heslo existující schránky `stopar@stopik.cz`. Server `smtp.websupport.cz`, port 465/TLS, uživatel `stopar@stopik.cz`, odesílatel `Pátrač <patrac@stopik.cz>`. Alias potvrdil vlastník. Neměnit heslo schránky ani konfiguraci Stopaře.
4. SMTP endpoint musí být dosažitelný z Workeru. Na stávající `.vercel.app` adrese ho může blokovat Vercel Deployment Protection. Ověřit připojení finální `patrac.stopik.cz` ke správnému projektu (ochrana vlastních domén je nyní vypnutá) a pak změnit `PATRAC_MAIL_RELAY_URL` v konfiguraci Workeru na `https://patrac.stopik.cz/api/internal/account-mail`. Alternativou je samostatný, úzce vymezený přístup přes Deployment Protection, nikdy vypnutí ochrany cizích projektů.
5. Nasadit frontend i Worker. `PATRAC_ALLOWED_ORIGINS` má jen přesné adresy vlastního frontendu, žádný wildcard všech Vercel projektů. `PATRAC_AUTH_BASE_URL` zůstává Worker URL.
6. Po konfiguraci SMTP a schématu zapnout `PATRAC_REGISTRATION_READY=true` v `worker/wrangler.jsonc` a nasadit. Potom ověřit doručení potvrzení, registraci, potvrzení odkazu, přihlášení, odhlášení, změnu hesla a obnovu hesla s reálnou schránkou vlastníka. Teprve poté otevírat hru veřejnosti. Potvrzení e-mailu se neobchází.

Po změně hesla pomocí obnovy se zneplatní všechny předchozí relace. Změna hesla v profilu vyžaduje současné heslo. Přihlášení a e-mailové požadavky mají limity uložené v D1. Účet je povinný jen pro tvůrce; týmové přístupy dál fungují vlastním klíčem.

## Přenos starých výprav

Starou verzi Sites zachovat do ověřeného exportu/importu produkční D1 a R2 a přenosu přístupů. Lokální QA databáze není produkční záloha. Uložené týmové klíče i rozehrané hry patří konkrétnímu originu v localStorage, nová doména je automaticky nepřenese. PWA na nové doméně vyžaduje novou instalaci. Žádné zdroje či účty dřívější autentizační služby se touto změnou nemažou.

## Kontroly

Node 22, `npm ci`, `npm test`, `npx tsc --noEmit`, `npm run build`, `npm run worker:check`.
`worker:check` nyní ověřuje i skutečné zabalení všech závislostí Workeru, ne jen TypeScript. Integrační testy účtů používají tentýž serverový modul nad dočasnou SQLite databází; e-maily v testech zachytí paměťová náhrada, nikomu se neposílají. Doručování přes skutečné SMTP čeká na konfiguraci.

## Fotografie nápověd

Nové soubory do 25 MiB se před odesláním překódují přes canvas (bez metadat), přednostně do WebP, s JPEG fallbackem. Delší strana je nejvýše 1280 px, cílová velikost 100 KiB a pevný limit 180 KiB. Kvalita neklesá pod 0,72; složitější obrázek může využít rezervu velikosti místo zbytečného zmenšování textu. Starší snímky se optimalizují při dalším uložení upravitelné výpravy a jen pokud je výsledek menší. Již optimalizované fotografie se opakovaně nepřekódují. Nejde o hromadnou migraci stávajícího R2 ani zásah do probíhajících her.

Při opakovaném uložení se identické fotografie ověřují hashem a vlastní původní referencí výpravy a znovu nenahrávají. Nahrazené objekty dané výpravy se uklízejí až po úspěšném CAS zápisu do D1; cizí prefixy se nemažou. Starší osiřelé objekty z dřívějších verzí nejsou touto změnou hromadně odstraněny.

## Administrace účtů

`/admin` používá stejný přihlašovací účet jako hra, ale ověřuje další oprávnění podle neměnného ID v `patrac_admin_accounts`. Žádná role se neodvozuje z e-mailu, přezdívky, uživatelských metadat ani prohlížeče. Každý API požadavek ověřuje platnou relaci, ověřený e-mail a členství správce. Údaje a operace jsou dostupné pouze přes `/api/admin/*`, s `no-store` a přesnými povolenými původy.

Před prvním použitím spustit `drizzle/0003_account_admin.sql` v samostatné D1 `patra`. Potom jednorázově vložit do `patrac_admin_accounts` ID již ověřeného vlastního účtu (například pomocí `INSERT ... SELECT id FROM patrac_auth_user WHERE email = ... AND emailVerified = 1`). Žádný správce se automaticky nevytváří a žádný běžný účet si oprávnění nemůže přidat přes API. Do veřejného repozitáře neukládat konkrétní osobní e-mail správce.

Správa obsahuje vyhledávání a stránkování všech účtů, změnu přezdívky/e-mailu, zaslání obnovy hesla a ověření, ukončení relací a historii správcovských zásahů. Hesla, hashe hesel ani session tokeny se nevracejí. Zápisy vyžadují přihlášení vytvořené nejvýše před 15 minutami; jinak UI vyžádá znovu heslo. Změna e-mailu zneplatní ověření a ukončí relace; adresát se načítá z databáze, nikoli z požadavku na reset. Chyba doručení při úpravě e-mailu je označená jako částečně dokončená operace, ne jako zrušená změna. E-mailové akce mají limity a audit je chráněn stejně jako účty. Oprávnění správce se přesunem adresy na jiného uživatele nepřenese.

Ověřeno integračními testy nad skutečnými podepsanými Better Auth relacemi a dočasnou SQLite databází: anonymní/nesprávcovské/podvržené přístupy, zastaralé změny, kolize e-mailu, odvolání relací, nutnost nového přihlášení, limity zpráv, částečné selhání e-mailu a okamžité odebrání role. První produkční správce musí být po nasazení potvrzen vlastníkem v D1; žádné hromadné e-maily se při nasazení neposílají.

## Platby a časově omezený přístup

Integrace Stripe Checkout používá jednorázové ceny 199/349/599 Kč na 3/6/12 kalendářních měsíců. Ceny v `worker/lib/billing.mjs` jsou výhradně ze sandboxu Pátrače. Délka se přičítá v UTC od pozdějšího z okamžiků potvrzení platby a dosavadního konce přístupu; neexistující den na konci měsíce se zkrátí na poslední den cílového měsíce. Testovací a ostré přístupy jsou v databázi oddělené.

Před zapnutím:

1. V D1 `patra` provést idempotentní `drizzle/0004_billing.sql` (nic nemaže).
2. Ve Worker Secrets uložit `STRIPE_SECRET_KEY` ze správného sandboxu, nikoli z Buy Me a Coffee. Do repozitáře ani do chatu ho nevkládat.
3. Ve stejném Stripe sandboxu přidat webhook `https://patrac-api.bednarik.workers.dev/api/billing/webhook`, události `checkout.session.completed` a `checkout.session.async_payment_succeeded`. Podpisový klíč endpointu uložit jako Worker Secret `STRIPE_WEBHOOK_SECRET`.
4. Až po přípravě schématu a klíčů nastavit Worker proměnné `PATRAC_BILLING_ENABLED=true` a `PATRAC_STRIPE_MODE=test`. V `wrangler.jsonc` záměrně nejsou; `keep_vars: true` zachovává jejich nastavení z dashboardu při dalších deployích. Před jejich nastavením jsou platby i omezení tvorby vypnuté a staré herní funkce nepotřebují nové tabulky.
5. Ověřit platbu v sandboxu přes profil skutečného testovacího účtu; samotný návrat na úspěšnou stránku nepřidá oprávnění. Podpis webhooku se ověřuje nad přesným tělem a časovým limitem, session se znovu načte ze Stripe a porovná s uloženou objednávkou, cenou, částkou, měnou a účtem. D1 transakce se zámkem podle revize aktivuje každý nákup jednou i při opakovaných událostech; neúspěch vrací chybu pro opakované doručení.

Bez aktivního přístupu se při zapnutém omezení na serveru blokuje vytvoření, úprava i start výpravy. Čtení vlastních výprav, výsledky a akce týmů zůstávají dostupné; rozběhnutou hru lze dokončit. Správce nemá automatickou výjimku. V profilu je výběr tarifu, datum konce a historie plateb. Automatické řešení vratek zatím není implementované; před ostrým provozem doplnit a ověřit vratky/reklamace, účetní doklady a obchodní podmínky.

Přechod do ostrého provozu je samostatný krok: ověřený vlastní Stripe účet, ostré ceny `STRIPE_PRICE_3`, `STRIPE_PRICE_6`, `STRIPE_PRICE_12`, ostrý klíč i podpis webhooku a `PATRAC_STRIPE_MODE=live`. Sandboxové nákupy nikdy neaktivují ostré oprávnění. Skutečné platby touto změnou nejsou zapnuté.

### Ruční přidělení přístupu v administraci

V detailu účtu v `/admin` je stav přístupu v aktuálním serverovém prostředí a posledních 50 objednávek. Správce může přidat 3/6/12 měsíců bez platby s povinným důvodem. Přidělení vyžaduje skutečnou správcovskou roli a přihlášení mladší 15 minut; testovací a ostré prostředí se nesmí měnit údajem z prohlížeče. D1 transakce zapisuje platnost a audit společně, kontroluje revizi proti souběžné platbě či jinému správci a identifikátor opakovaného požadavku zabraňuje dvojímu prodloužení. Ruční přidělení nevytváří fiktivní objednávku a neposílá e-mail. Nevyžaduje novou migraci nad již zavedeným schématem `0004_billing.sql`.

## Dokončení stanoviště v editoru

Pod nápovědami je „Uložit stanoviště“. Zkontroluje jen aktuální stanoviště, u nové výpravy uloží koncept do zařízení a sbalí formulář k tlačítku „Přidat další stanoviště“. Existující stanoviště lze znovu otevřít v trase. U již vytvořené výpravy jde o přípravu změn v editoru; teprve závěrečné „Uložit změny“ zapisuje celou výpravu na server. „Vytvořit výpravu“ zůstává závěrečným krokem nové výpravy. Při nedostupném místním úložišti editor zobrazí upozornění a umožní dokončení bez zavření stránky.

Omylem přidané prázdné stanoviště lze odstranit bez vyplňování nebo potvrzení tlačítkem dole u ukládání i ikonou koše nahoře. Vyplněné stanoviště vyžaduje potvrzení; u posledního zbývajícího místa se vymažou údaje a zachová jeden prázdný formulář. Před startem je možné upravit název, režim, celou trasu a obsah i s připojenými čekajícími týmy. Server kontroluje stav `waiting` a verzi v atomickém zápisu; start nebo novější úprava zablokují zastaralé uložení. Po startu se trasa nemění.

## Tři výpravy a ruční mazání

Tvůrce má nejvýše 3 uložené výpravy. Zůstávají funkční i po dohrání a stále obsazují místo v limitu; automatický úklid ani mazání po dokončení není zapnuté. Čtvrtou výpravu lze vytvořit až po ručním smazání některé dosavadní. Limit vynucuje SQL transakce při vytváření i při přiřazování starých výprav, takže ho neobejde souběžné otevření více oken. Dříve uložené výpravy nad limitem se samy nemažou.

„Smazat celou výpravu“ v přehledu autora vyžaduje opsání kódu a skutečné vlastnictví ověřené účtem. Je dostupné i po vypršení placeného přístupu. Nejprve se výprava uzamkne pro mazání, potom se odstraní všechny fotografie pod jejím vlastním prefixem R2 (včetně starých nepoužitých), nakonec se transakčně odstraní týmy, výsledky a samotná výprava. Při selhání R2 zůstane označená výprava s vlastnictvím pro opakování úklidu; slot se uvolní až po dokončení. Nevyžaduje se nová databázová migrace. Žádné existující produkční výpravy se při nasazení nemažou.

Nový tým se může připojit i k již spuštěné či dohrané výpravě. Dostane vlastní `startedAt`, podle kterého se počítá jeho čas i přesun na první stanoviště. Původní týmy a výsledky zůstávají. Na prvním společném startu se dál odstartují současně všechny čekající týmy; limit 30 se vztahuje na právě nedohrané týmy. Odehrání výpravy nikdy nemění její stav na nepřístupný ani ji neodstraňuje.

## Komunitní mapa a veřejné pokusy

Úvodní obrazovka zobrazuje mapu veřejných výprav, s navigací Mapa / Moje hraní / Tvořit / Profil. Nabídku, první stanoviště a TOP 10 lze prohlížet bez placeného účtu. Zahájení i pokračování ve veřejném hraní vyžaduje platnou ověřenou relaci a aktivní přístup v aktuálním platebním prostředí. Registrace sama neuděluje bezplatný tarif. Soukromé týmy se nadále připojují kódem bez účtu.

Nové kvóty jsou oddělené: 3 soukromé a 2 veřejné výpravy na tvůrce. Starší hry bez `visibility` jsou soukromé. Viditelnost je přiřazená při vytvoření a nelze ji změnit ukládáním jiného typu; tím se neobcházejí kvóty ani jednorázové pokusy. Soukromé a veřejné koncepty mají oddělené klíče v IndexedDB.

Veřejná výprava je vždy `race`, s popisem, obtížností, přibližnou délkou a časem. Po vytvoření je skrytá a autor ji zveřejní v přehledu. Mapové dotazy vracejí jen výslovně vybrané veřejné informace a souřadnice první zastávky; žádné otázky, odpovědi, nápovědy, další souřadnice, e-maily či herní klíče. Dotaz může obsahovat `bounds=west,south,east,north`, vrací nejvýše 150 bodů a informaci o dalších výpravách.

Před použitím v D1 `patra` jednou spustit `drizzle/0005_public_expeditions.sql`. Je idempotentní a nic nemaže. Obsahuje tabulku pokusů a mapové indexy. Před migrací mapa oznámí přípravu veřejných výprav a soukromé hry zůstávají dostupné. Žádný další tajný klíč ani nová služba není potřeba.

Jedna kombinace účtu, veřejné výpravy a platebního prostředí má nejvýše jeden pokus díky unikátnímu omezení D1. Start se potvrzuje výslovně; opakování požadavku vrací stejný pokus a čas. Zavření aplikace, jiné zařízení, nová přezdívka ani znovuzveřejnění nedají nový pokus. Sandbox a ostré pokusy i žebříčky jsou oddělené. Autor do vlastní veřejné výpravy nezapisuje soutěžní pokus. Po prvním startu je trasa uzamčená a SQL zápis chrání i závod mezi úpravou a prvním hráčem. Skrytí z mapy zastaví nové starty, ale rozehrané pokusy zachová. Platnost předplatného se kontroluje i při pokračování; při vypršení lze po obnovení navázat, čas se neresetuje.

Veřejná hra používá samostatné `/api/public/*` routy s účtem, ne sdílený týmový klíč. Starý soukromý join/answer/hint endpoint odmítá veřejné hry. TOP 10 obsahuje jen dokončené pokusy podle serverového času plus penalizací, přezdívku z profilu a dokončení. Jeden účet nezabírá více příček v jedné výpravě. Veškeré časování a postup ukládá D1 s kontrolou revizí. Profil dovoluje změnu přezdívky přes vlastní Better Auth relaci.

Účetní admin, přihlášení, Stripe, SMTP a stávající soukromá navigace zůstávají ve stejných oddělených prostředcích Pátrače. Žádná data Stopaře se touto změnou neupravují. Automatické mazání výprav po dohrání není implementované ani zapnuté. Ruční smazání celé výpravy odstraní také její veřejné pokusy a související fotografie.


### Hodnocení veřejných výprav

Po migraci `drizzle/0006_public_reviews.sql` detail veřejné výpravy nabízí 1–5 hvězdiček a volitelný komentář do 1000 znaků. Hodnotit smí jen ověřený účet s dokončeným pokusem ve stejném prostředí; autor vlastní výpravu nehodnotí. Vypršení předplatného nebrání zpětné vazbě po dohrání. Každý účet má jedno upravitelné a odstranitelné hodnocení na výpravu a prostředí, chráněné primárním klíčem. Komentáře se vykreslují jako prostý text a používají přezdívku z profilu; veřejná odpověď neobsahuje ID účtů ani e-maily. Seznam se načítá po 20 položkách. Průměr a počet hodnocení se ukazují v detailu a seznamu mapy. Testovací a ostrá hodnocení se nemíchají. Smazání výpravy odstraní i hodnocení. Před migrací tato sekce zůstává skrytá a ostatní funkce dál fungují.

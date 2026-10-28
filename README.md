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

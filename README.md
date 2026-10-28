# Pátrač

Samostatná aplikace: Next.js na Vercelu, herní API v Cloudflare Workers, vlastní D1 a R2, Supabase pouze pro přihlášení tvůrců. Stopař se nemění.

## Ověření

Node 22+, `npm ci`, `npm test`, `npx tsc --noEmit`, `npm run worker:check`, `npm run build`.

## Nasazení (dosud nedokončeno)

1. Založit nový soukromý repozitář `patrac` v GitHub účtu Lukas1212890. Tento adresář je připravený zdroj, bez přihlašovacích údajů.
2. V Cloudflare vytvořit NOVOU D1 `patrac` a R2 `patrac-photos`. Doplnit skutečné ID databáze do `worker/wrangler.jsonc`. Nepoužívat žádné vazby Stopaře.
3. Před přechodem exportovat dosavadní produkční herní data a všechny fotografie ze Sites. Importovat původní kódy, hashe klíčů, payloady i verze; ověřit počty a obsah. Pak doplnit migraci `0001`. Lokální testovací databáze není produkční záloha.
4. Worker: nastavit veřejný Supabase publishable key `PATRAC_AUTH_PUBLISHABLE_KEY`. Auth URL je již vlastní projekt Pátrače. `PATRAC_ALLOWED_ORIGINS` obsahuje jen přesné adresy vlastního frontendu oddělené čárkou. Žádný wildcard pro všechny Vercel projekty. `npm run worker:deploy` až po doplnění vazeb a importu dat.
5. Založit samostatný Vercel projekt propojený jen s novým repozitářem. Nastavit `NEXT_PUBLIC_PATRAC_API_URL` na jeho Cloudflare Worker HTTPS URL. Build `npm run build`. Frontend posílá fotky přímo do API, nepodléhá limitu těla Vercel Functions. Odpovědi s herními daty se necachují.
6. Doplnit přesnou produkční Vercel adresu do origin allowlistu Workeru. Otestovat hráče, autorizaci tvůrce, fotografie, obnovení relace, příjezd a nápovědy.
7. SMTP Supabase není hotové. Ověřit odesílání `patrac@stopik.cz` a potvrzení registrace/reset hesla; teprve potom `PATRAC_REGISTRATION_READY=true`. Supabase Site URL a redirect allowlist nastavit na nový frontend.
8. Až po ověření připojit `patrac.stopik.cz` k NOVÉMU Vercel projektu a použít DNS z Vercelu. Starý navržený CNAME `custom-domains.chatgpt.site` nepoužívat. Nepřepisovat apex, MX ani Stopaře. Přidat novou doménu do Cloudflare originů i Supabase redirectů.

Přístupové klíče týmů a uložené rozehrané hry jsou v localStorage původního originu. Přechod na jinou adresu je automaticky nepřenese: před přesměrováním připravit export/import přístupů nebo obnovu kódem a uloženým klíčem. Starou verzi ponechat dostupnou do ověření přenosu. PWA bude na nové adrese nutné znovu nainstalovat.

## Co již prošlo

36 automatických testů; TypeScript frontendu i Workeru; produkční Next.js build. Zatím neproběhlo skutečné nasazení, přenos produkčních dat ani ověření e-mailových účtů.

// Activity is a started, unfinished, non-abandoned attempt, in either billing environment.
const active="json_extract(active_t.payload,'$.finishedAt') IS NULL AND json_extract(active_t.payload,'$.abandonedAt') IS NULL AND (json_extract(active_t.payload,'$.startedAt') IS NOT NULL OR (COALESCE(json_extract(active_t.payload,'$.individualStart'),0)<>1 AND json_extract(active_e.payload,'$.startedAt') IS NOT NULL))";
export const activePlayersQuery=codeSql=>`SELECT 1 FROM patrac_teams active_t JOIN patrac_expeditions active_e ON active_e.code=active_t.code WHERE active_t.code=${codeSql} AND ${active}`;
export async function activePlayerCount(db,code){const row=await db.prepare(`SELECT COUNT(*) AS n FROM (${activePlayersQuery('?')})`).bind(code).first();return Number(row.n);}
export const activePlayMessage='Výpravu právě někdo hraje. Úpravy, skrytí a smazání budou dostupné po dokončení nebo ukončení všech aktivních pokusů.';

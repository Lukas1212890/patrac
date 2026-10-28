const keys = game => new Set((game?.stations || []).flatMap(s => (s.hints || []).map(h => h.photoKey).filter(Boolean)));
export async function storeHintPhotos(config, code, bucket, previous) {
  const allowed = keys(previous);
  for (const station of config.stations) for (const hint of station.hints) {
    if (hint.type !== 'photo') continue;
    if (!bucket) throw Error('Photo storage unavailable');
    const [prefix, data] = hint.content.split(',');
    const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2,'0')).join('');
    const contentType = prefix.slice(5, prefix.indexOf(';'));
    let key = hint.photoKey;
    const existing = key && allowed.has(key) ? await bucket.head(key) : null;
    if (!existing || existing.customMetadata?.sha256 !== digest || existing.httpMetadata?.contentType !== contentType) {
      key = `hints/${code}/${crypto.randomUUID()}`;
      await bucket.put(key, bytes, { httpMetadata: { contentType }, customMetadata: { sha256: digest } });
    }
    hint.photoKey = key; hint.content = '';
  }
  return config;
}
export async function removeReplacedPhotos(previous, next, code, bucket) {
  const retained = keys(next), removed = [...keys(previous)].filter(key => key.startsWith(`hints/${code}/`) && !retained.has(key));
  if (removed.length && bucket) await bucket.delete(removed);
}

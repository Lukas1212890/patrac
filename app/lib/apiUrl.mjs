export function apiUrl(path) {
  const base = (process.env.NEXT_PUBLIC_PATRAC_API_URL || '').replace(/\/$/, '');
  if (!base) throw new Error('Herní server zatím není nakonfigurovaný.');
  return base + path;
}

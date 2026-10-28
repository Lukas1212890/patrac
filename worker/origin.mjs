export function allowedOrigin(origin, configured) {
  if (!origin || origin === 'null') return false;
  return (configured || '').split(',').map(x => x.trim()).filter(Boolean).includes(origin);
}

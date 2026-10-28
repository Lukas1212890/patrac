export const PHOTO_VERSION = 2;
export const PHOTO_TARGET_BYTES = 100 * 1024;
export const PHOTO_MAX_BYTES = 180 * 1024;
export function photoDimensions(width, height, maximum = 1280) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || width * height > 80000000) throw Error('Fotografii se nepodařilo načíst nebo je příliš rozměrná.');
  const scale = Math.min(1, maximum / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
export function dataUrlBytes(url) {
  const data = url.slice(url.indexOf(',') + 1);
  return Math.floor(data.length * 3 / 4) - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0);
}
// Prefer quality and readable dimensions before lowering the size further.
export async function compressPhoto(encode, width, height) {
  let best;
  for (const maximum of [1280, 1120, 960, 800, 640]) {
    const dimensions = photoDimensions(width, height, maximum);
    for (const quality of [.84, .78, .72]) {
      const webp = await encode(dimensions, 'image/webp', quality);
      const candidates = [];
      if (webp.startsWith('data:image/webp;base64,')) candidates.push(webp);
      // Safari without WebP encoding may silently return PNG. Always have a JPEG fallback.
      if (!candidates.length) candidates.push(await encode(dimensions, 'image/jpeg', quality));
      for (const value of candidates) {
        if (!/^data:image\/(webp|jpeg);base64,/.test(value)) throw Error('Prohlížeč nedokázal fotografii zmenšit.');
        const bytes = dataUrlBytes(value);
        if (!best || bytes < dataUrlBytes(best)) best = value;
        if (bytes <= PHOTO_TARGET_BYTES) return value;
      }
    }
    // Preserve readable detail if close to the target rather than shrinking text unnecessarily.
    if (best && dataUrlBytes(best) <= PHOTO_MAX_BYTES) return best;
  }
  throw Error('Fotografie je příliš složitá. Zkuste ji oříznout na důležitou část.');
}

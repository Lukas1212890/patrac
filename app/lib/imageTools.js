import { compressPhoto, PHOTO_VERSION } from './photoCompression.mjs';
async function prepareSource(source) {
  const image = await new Promise((resolve, reject) => {
    const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(Error('Fotografii nelze načíst. Zkuste JPEG, PNG nebo WebP.')); img.src = source;
  });
  const canvas = document.createElement('canvas'), context = canvas.getContext('2d');
  if (!context) throw Error('Prohlížeč neumí zpracovat fotografii.');
  try {
    return await compressPhoto((size, type, quality) => {
      canvas.width = size.width; canvas.height = size.height;
      context.fillStyle = '#fff'; context.fillRect(0, 0, size.width, size.height);
      context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
      context.drawImage(image, 0, 0, size.width, size.height);
      return canvas.toDataURL(type, quality);
    }, image.naturalWidth || image.width, image.naturalHeight || image.height);
  } finally { canvas.width = 1; canvas.height = 1; }
}
export async function preparePhoto(file, { maxSize = 25 * 1024 * 1024 } = {}) {
  if (!file) throw Object.assign(Error('NO_FILE'), { code: 'NO_FILE' });
  if (!file.type.startsWith('image/')) throw Error('Vyberte fotografii, ne jiný typ souboru.');
  if (file.size > maxSize) throw Error('FILE_TOO_LARGE');
  const source = URL.createObjectURL(file);
  try { return await prepareSource(source); } finally { URL.revokeObjectURL(source); }
}
export async function optimizeDraftPhotos(draft) {
  const stations = [];
  // Process sequentially so a 50-stop expedition does not decode all images at once.
  for (const station of draft.stations) {
    const hints = [];
    for (const hint of station.hints || []) {
      if (hint.type !== 'photo' || hint.photoVersion === PHOTO_VERSION) { hints.push(hint); continue; }
      const optimized = await prepareSource(hint.content);
      // Existing small photos must never get larger just because the game was saved.
      hints.push({ ...hint, content: optimized.length < hint.content.length ? optimized : hint.content, photoVersion: PHOTO_VERSION });
    }
    stations.push({ ...station, hints });
  }
  return { ...draft, stations };
}

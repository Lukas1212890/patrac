// GPS smoothing copied from Stopař aa173d0c0e1f2b21850f89922716cccb7ced8732.
function distanceMeters(a, b) {
  const radius = 6371000;
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * radius * Math.asin(Math.sqrt(h));
}

export function smoothPosition(samples) {
  if (!samples.length) return null;

  const ranked = [...samples].sort((a, b) => a.acc - b.acc);
  const bestAccuracy = ranked[0].acc;
  const accuracyLimit = Math.max(18, bestAccuracy * 1.7);

  const selected = ranked
    .filter((sample) => sample.acc <= accuracyLimit)
    .slice(0, 5);

  if (!selected.length) return null;

  let lat = 0;
  let lng = 0;
  let weightSum = 0;

  for (const sample of selected) {
    const weight = 1 / Math.max(sample.acc, 3) ** 2;
    lat += sample.lat * weight;
    lng += sample.lng * weight;
    weightSum += weight;
  }

  const center = {
    lat: lat / weightSum,
    lng: lng / weightSum,
  };

  const spread = Math.max(
    0,
    ...selected.map((sample) => distanceMeters(sample, center))
  );

  return {
    ...center,
    acc: Math.max(Math.round(bestAccuracy), Math.round(spread)),
    sampleCount: selected.length,
    stabilizing: selected.length < 3 && bestAccuracy > 10,
  };
}


// The same eight-sample window and jump rejection as Stopař's navigation.
export function createStopikTracker() {
 let samples = [], lastPublished = null;
 return { push(sample) {
  if (!Number.isFinite(sample.lat) || !Number.isFinite(sample.lng) || !Number.isFinite(sample.acc) || sample.acc <= 0 || sample.acc > 120) return null;
  samples.push(sample); if (samples.length > 8) samples.shift();
  const smoothed = smoothPosition(samples); if (!smoothed) return null;
  if (lastPublished && smoothed.acc > 25 && distanceMeters(lastPublished, smoothed) > 35) return null;
  lastPublished = smoothed;
  return { ...smoothed, samples: smoothed.sampleCount, timestamp: sample.timestamp, arrivalFix: sample };
 }};
}

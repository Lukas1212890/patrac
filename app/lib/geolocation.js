function toPosition(position) {
  return {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    acc: position.coords.accuracy,
  };
}

export function getCurrentPosition({
  enableHighAccuracy = true,
  timeout = 15000,
  maximumAge = 0,
} = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("GEOLOCATION_UNAVAILABLE"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => resolve(toPosition(position)),
      reject,
      {
        enableHighAccuracy,
        timeout,
        maximumAge,
      }
    );
  });
}

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

function buildStablePosition(samples) {
  const ranked = [...samples].sort((a, b) => a.acc - b.acc);
  const bestAccuracy = ranked[0]?.acc ?? Infinity;
  const limit = Math.max(20, bestAccuracy * 1.8);
  const selected = ranked.filter((sample) => sample.acc <= limit).slice(0, 5);

  if (!selected.length) return null;

  let weightSum = 0;
  let lat = 0;
  let lng = 0;

  for (const sample of selected) {
    const weight = 1 / Math.max(sample.acc, 3) ** 2;
    weightSum += weight;
    lat += sample.lat * weight;
    lng += sample.lng * weight;
  }

  const center = {
    lat: lat / weightSum,
    lng: lng / weightSum,
  };

  const spread = Math.max(
    0,
    ...selected.map((sample) => distanceMeters(sample, center))
  );

  const acc = Math.max(
    Math.round(bestAccuracy),
    Math.round(spread)
  );

  return {
    ...center,
    acc,
    sampleCount: selected.length,
    rawSampleCount: samples.length,
    spread: Math.round(spread),
  };
}

export function getStablePosition({
  maxDuration = 15000,
  targetAccuracy = 10,
  acceptableAccuracy = 20,
  onUpdate,
} = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("GEOLOCATION_UNAVAILABLE"));
      return;
    }

    const samples = [];
    let settled = false;
    let watchId = null;
    let timer = null;

    const finish = (error) => {
      if (settled) return;
      settled = true;

      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
      if (timer) clearTimeout(timer);

      const position = buildStablePosition(samples);

      if (position) {
        resolve({
          ...position,
          quality:
            position.acc <= targetAccuracy
              ? "good"
              : position.acc <= acceptableAccuracy
                ? "ok"
                : "poor",
        });
        return;
      }

      reject(error || new Error("GEOLOCATION_UNAVAILABLE"));
    };

    watchId = navigator.geolocation.watchPosition(
      (position) => {
        const sample = toPosition(position);

        if (
          !Number.isFinite(sample.lat) ||
          !Number.isFinite(sample.lng) ||
          !Number.isFinite(sample.acc) ||
          sample.acc <= 0 ||
          sample.acc > 250
        ) {
          return;
        }

        samples.push(sample);
        if (samples.length > 12) samples.shift();

        const stable = buildStablePosition(samples);
        if (!stable) return;

        onUpdate?.({
          ...stable,
          stabilizing: true,
          quality:
            stable.acc <= targetAccuracy
              ? "good"
              : stable.acc <= acceptableAccuracy
                ? "ok"
                : "poor",
        });

        const recent = samples.slice(-3);
        const hasStableCluster =
          recent.length >= 3 &&
          recent.every((item) => item.acc <= acceptableAccuracy) &&
          Math.max(
            ...recent.map((item) =>
              distanceMeters(item, {
                lat: stable.lat,
                lng: stable.lng,
              })
            )
          ) <= 15;

        if (
          samples.length >= 3 &&
          stable.acc <= targetAccuracy &&
          hasStableCluster
        ) {
          finish();
        }
      },
      (error) => {
        if (!samples.length) finish(error);
      },
      {
        enableHighAccuracy: true,
        timeout: maxDuration,
        maximumAge: 0,
      }
    );

    timer = setTimeout(() => finish(), maxDuration);
  });
}


const toRadians = (value) => (value * Math.PI) / 180;

export function distanceTo(a, b) {
  const radius = 6371000;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) *
      Math.cos(toRadians(b.lat)) *
      Math.sin(dLng / 2) ** 2;

  return 2 * radius * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function bearingTo(a, b) {
  const y =
    Math.sin(toRadians(b.lng - a.lng)) * Math.cos(toRadians(b.lat));
  const x =
    Math.cos(toRadians(a.lat)) * Math.sin(toRadians(b.lat)) -
    Math.sin(toRadians(a.lat)) *
      Math.cos(toRadians(b.lat)) *
      Math.cos(toRadians(b.lng - a.lng));

  return (Math.atan2(y, x) * 180) / Math.PI + 360;
}

export function autoFitNavMap(map, a, b, isFull = false, heading = null, zoomCap = 19) {
  if (!map || !a || !b) return;

  const distance = distanceTo(a, b);
  const distanceZoom =
    distance < 30
      ? 19
      : distance < 80
        ? 18
        : distance < 200
          ? 17
          : distance < 500
            ? 16
            : distance < 1200
              ? 15
              : 14;
  const maxZoom = Math.min(distanceZoom, zoomCap);

  const padding = isFull
    ? { top: 90, bottom: 90, left: 70, right: 70 }
    : { top: 54, bottom: 54, left: 42, right: 42 };

  try {
    map.fitBounds(
      [
        [Math.min(a.lng, b.lng), Math.min(a.lat, b.lat)],
        [Math.max(a.lng, b.lng), Math.max(a.lat, b.lat)],
      ],
      {
        padding,
        maxZoom,
        duration: 500,
        bearing: typeof heading === "number" ? heading : map.getBearing(),
      }
    );
  } catch {}
}


export function project(point, zoom) {
  const scale = 256 * 2 ** zoom;
  const lat = Math.max(-85, Math.min(85, point.lat)) * Math.PI / 180;
  return { x: (point.lng + 180) / 360 * scale, y: (1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2 * scale };
}
export function unproject(x, y, zoom) {
  const scale = 256 * 2 ** zoom;
  return { lng: ((x / scale * 360 % 360 + 360) % 360) - 180,
    lat: Math.atan(Math.sinh(Math.PI * (1 - 2 * Math.max(0, Math.min(scale, y)) / scale))) * 180 / Math.PI };
}

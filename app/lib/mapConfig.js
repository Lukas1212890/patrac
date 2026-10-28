export function getBaseMapConfig(baseMap) {
  if (baseMap === "aerial") {
    return {
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      attribution: "Sources: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
      // Esri World Imagery is not consistently populated at z19 in every area.
      // Stop at z18 and let MapLibre overzoom the last valid imagery tile.
      maxzoom: 18,
    };
  }

  return {
    tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"],
    attribution: "Sources: Esri, HERE, Garmin, Intermap, USGS, OpenStreetMap contributors, GIS User Community",
    maxzoom: 19,
  };
}

export function getNavigationZoom(distance, hasPosition, maxZoom) {
  const rawZoom = hasPosition
    ? distance < 30
      ? 19
      : distance < 80
        ? 18
        : distance < 200
          ? 17
          : distance < 500
            ? 16
            : distance < 1200
              ? 15
              : 14
    : 18;

  return Math.min(rawZoom, maxZoom);
}

export function createTargetZone(target) {
  const zone = [];

  for (let i = 0; i <= 64; i++) {
    const angle = (i / 64) * Math.PI * 2;
    const dy = Math.cos(angle) * 7.5;
    const dx = Math.sin(angle) * 7.5;

    zone.push([
      target.lng +
        dx / (111320 * Math.cos((target.lat * Math.PI) / 180)),
      target.lat + dy / 110540,
    ]);
  }

  return zone;
}


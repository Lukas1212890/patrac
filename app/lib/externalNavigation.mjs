// Coordinates in saved stops use latitude/longitude; Mapy.com expects longitude/latitude.
export function parseCoordinates(point) {
  if (!point || typeof point !== "object") return null;

  const { lat, lng } = point;
  if (
    (typeof lat !== "number" && typeof lat !== "string") ||
    (typeof lng !== "number" && typeof lng !== "string") ||
    (typeof lat === "string" && !lat.trim()) ||
    (typeof lng === "string" && !lng.trim())
  ) {
    return null;
  }

  const latitude = Number(lat);
  const longitude = Number(lng);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return null;
  }

  return { lat: latitude, lng: longitude };
}

export function buildExternalNavigationUrls(target, origin) {
  const end = parseCoordinates(target);
  if (!end) return null;

  const start = parseCoordinates(origin);

  // Google Maps must resolve its own live starting location. A fixed origin
  // becomes "Zadaný špendlík" and can leave iOS in route preview.
  const googleMapsUrl =
    "https://www.google.com/maps/dir/?api=1" +
    "&destination=" + end.lat + "," + end.lng +
    "&travelmode=walking&dir_action=navigate";

  // Mapy.com needs both endpoints to display the planned walking route.
  const mapyRouteUrl = start
    ? "https://mapy.com/fnc/v1/route?mapset=outdoor" +
      "&start=" + start.lng + "," + start.lat +
      "&end=" + end.lng + "," + end.lat +
      "&routeType=foot_hiking"
    : null;
  const mapyUrl = mapyRouteUrl ? mapyRouteUrl + "&navigate=true" : null;

  return { googleMapsUrl, mapyUrl, mapyRouteUrl };
}


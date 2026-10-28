import test from "node:test";
import assert from "node:assert/strict";
import {
  buildExternalNavigationUrls,
  parseCoordinates,
} from "../app/lib/externalNavigation.mjs";

test("published game stop keeps its destination after JSON save/load", () => {
  const game = {
    stops: [{ card: "01", hint: "Za mostem", lat: 49.277816, lng: 17.788809 }],
  };
  const target = JSON.parse(JSON.stringify(game)).stops[0];
  const links = buildExternalNavigationUrls(target, {
    lat: 49.278116,
    lng: 17.789109,
  });
  assert.equal(
    new URL(links.googleMapsUrl).searchParams.get("destination"),
    "49.277816,17.788809"
  );
  assert.equal(
    new URL(links.googleMapsUrl).searchParams.has("origin"),
    false,
    "Google must use its own live device position, not a pinned origin"
  );
  const mapy = new URL(links.mapyUrl);
  assert.equal(mapy.searchParams.get("start"), "17.789109,49.278116");
  assert.equal(mapy.searchParams.get("end"), "17.788809,49.277816");
  assert.equal(mapy.searchParams.get("navigate"), "true");
  const preview = new URL(links.mapyRouteUrl);
  assert.equal(preview.searchParams.get("end"), "17.788809,49.277816");
  assert.equal(preview.searchParams.has("navigate"), false);
});

test("next stop gets its own coordinates, never those of the previous stop", () => {
  const stops = [
    { lat: 49.277816, lng: 17.788809 },
    { lat: 50.0878, lng: 14.4606 },
  ];
  const next = buildExternalNavigationUrls(stops[1], { lat: 50, lng: 14 });
  assert.equal(new URL(next.googleMapsUrl).searchParams.get("destination"), "50.0878,14.4606");
  assert.equal(new URL(next.mapyUrl).searchParams.get("end"), "14.4606,50.0878");
});

test("without current GPS Google retains the destination, Mapy.com cannot open an empty route", () => {
  const links = buildExternalNavigationUrls({ lat: 49.27, lng: 17.78 }, null);
  assert.equal(new URL(links.googleMapsUrl).searchParams.get("destination"), "49.27,17.78");
  assert.equal(new URL(links.googleMapsUrl).searchParams.has("origin"), false);
  assert.equal(links.mapyUrl, null);
  assert.equal(links.mapyRouteUrl, null);
});

test("invalid stops never produce links to undefined or NaN", () => {
  for (const point of [
    null,
    {},
    { lat: undefined, lng: 17.78 },
    { lat: "", lng: 17.78 },
    { lat: NaN, lng: 17.78 },
    { lat: 91, lng: 17.78 },
    { lat: 49.27, lng: -181 },
  ]) {
    assert.equal(parseCoordinates(point), null);
    assert.equal(buildExternalNavigationUrls(point, { lat: 49, lng: 17 }), null);
  }
  assert.deepEqual(parseCoordinates({ lat: "0", lng: 0 }), { lat: 0, lng: 0 });
});


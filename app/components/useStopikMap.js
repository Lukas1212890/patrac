"use client";

import { useEffect, useRef } from "react";
import { loadMap } from "../components/PatracMap";
import { distanceTo, autoFitNavMap } from "../lib/navigationMath";
import { getBaseMapConfig, getNavigationZoom, createTargetZone } from "../lib/mapConfig";

export default function useStopikMap({
  compass,
  navView,
  active,
  currentIndex,
  compassPos,
  heading,
  mapFull,
  baseMap,
  setCompassError,
}) {
  const latest = useRef({ compassPos, heading });
  latest.current = { compassPos, heading };
  useEffect(() => {
    if (!compass || navView !== "map" || !active) return;

    let cancelled = false;

    const run = async () => {
      try {
        const mod = await loadMap();
        if (cancelled) return;

        const maplibregl = mod.default || mod;
        window.__patracNavigationMapLibre = maplibregl;
        let element = null;

        for (let i = 0; i < 20 && !element; i++) {
          element = document.getElementById("patracStopikMap");
          if (!element) {
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
        }

        if (cancelled || !element) return;

        if (window.__patracNavigationMap) {
          window.__patracNavigationMap.remove();
          window.__patracNavigationMap = null;
        }

        const target = active.stops[currentIndex];
        const hasPosition = !!compassPos;
        const distance = hasPosition
          ? distanceTo(compassPos, { lat: target.lat, lng: target.lng })
          : null;

        const base = getBaseMapConfig(baseMap);
        const zoom = getNavigationZoom(distance, hasPosition, base.maxzoom);

        const map = new maplibregl.Map({
          container: element,
          style: {
            version: 8,
            sources: {
              base: {
                type: "raster",
                tiles: base.tiles,
                tileSize: 256,
                attribution: base.attribution,
                maxzoom: base.maxzoom,
              },
            },
            layers: [{ id: "base", type: "raster", source: "base" }],
          },
          center: hasPosition
            ? [compassPos.lng, compassPos.lat]
            : [target.lng, target.lat],
          zoom,
          bearing: heading || 0,
          pitch: 0,
          interactive: false,
          scrollZoom: false,
          boxZoom: false,
          dragRotate: false,
          dragPan: false,
          keyboard: false,
          doubleClickZoom: false,
          touchZoomRotate: false,
          attributionControl: false,
        });

        window.__patracNavigationMap = map;
        map.addControl(new maplibregl.AttributionControl({ compact: false }), "bottom-right");

        map.on("load", () => {
          if (cancelled) return;
          const { compassPos, heading } = latest.current;
          const hasPosition = Boolean(compassPos);

          map.resize();

          map.addSource("route", {
            type: "geojson",
            data: {
              type: "Feature",
              geometry: {
                type: "LineString",
                coordinates: hasPosition
                  ? [
                      [compassPos.lng, compassPos.lat],
                      [target.lng, target.lat],
                    ]
                  : [
                      [target.lng, target.lat],
                      [target.lng, target.lat],
                    ],
              },
            },
          });

          map.addLayer({
            id: "route",
            type: "line",
            source: "route",
            paint: {
              "line-color": "#1687ff",
              "line-width": 6,
            },
          });

          const zone = createTargetZone(target);

          map.addSource("target-zone", {
            type: "geojson",
            data: {
              type: "Feature",
              geometry: {
                type: "Polygon",
                coordinates: [zone],
              },
            },
          });

          map.addLayer({
            id: "target-zone-fill",
            type: "fill",
            source: "target-zone",
            paint: {
              "fill-color": "#ff9f0a",
              "fill-opacity": 0.3,
            },
          });

          map.addLayer({
            id: "target-zone-outline",
            type: "line",
            source: "target-zone",
            paint: {
              "line-color": "#ff9f0a",
              "line-opacity": 0.9,
              "line-width": 2,
            },
          });

          if (hasPosition) {
            if (!window.__patracNavigationUserMarker) {
              const userElement = Object.assign(document.createElement("div"), {
                className: "p-stopik-user-dot",
              });

              window.__patracNavigationUserMarker = new maplibregl.Marker({
                element: userElement,
              })
                .setLngLat([compassPos.lng, compassPos.lat])
                .addTo(map);
            } else {
              window.__patracNavigationUserMarker.setLngLat([
                compassPos.lng,
                compassPos.lat,
              ]);
            }

            autoFitNavMap(
              map,
              compassPos,
              { lat: target.lat, lng: target.lng },
              mapFull,
              heading,
              base.maxzoom
            );
          }
        });
      } catch {
        setCompassError("Mapu se nepodařilo načíst.");
      }
    };

    run();

    return () => {
      cancelled = true;

      if (window.__patracNavigationMap) {
        window.__patracNavigationMap.remove();
        window.__patracNavigationMap = null;
      }

      window.__patracNavigationUserMarker = null;
      window.__patracNavigationTargetMarker = null;
      window.__patracNavigationMapLibre = null;
    };
  }, [compass, navView, currentIndex, active, baseMap]);

  useEffect(() => {
    const map = window.__patracNavigationMap;
    const target = active?.stops?.[currentIndex];

    if (
      !map ||
      !map.loaded?.() ||
      !compassPos ||
      !target ||
      navView !== "map"
    ) {
      return;
    }

    try {
      if (!window.__patracNavigationUserMarker) {
        const maplibregl = window.__patracNavigationMapLibre;
        if (maplibregl && window.__patracNavigationMap) {
          const element = document.createElement("div");
          element.className = "p-stopik-user-dot";
          window.__patracNavigationUserMarker = new maplibregl.Marker({
            element,
          })
            .setLngLat([compassPos.lng, compassPos.lat])
            .addTo(window.__patracNavigationMap);
        }
      } else {
        window.__patracNavigationUserMarker.setLngLat([
          compassPos.lng,
          compassPos.lat,
        ]);
      }

      const source = map.getSource?.("route");
      if (source) {
        source.setData({
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [
              [compassPos.lng, compassPos.lat],
              [target.lng, target.lat],
            ],
          },
        });
      }

      autoFitNavMap(
        map,
        compassPos,
        { lat: target.lat, lng: target.lng },
        mapFull,
        heading,
        getBaseMapConfig(baseMap).maxzoom
      );
    } catch {}
  }, [
    compassPos?.lat,
    compassPos?.lng,
    heading,
    navView,
    currentIndex,
    mapFull,
    baseMap,
  ]);

  useEffect(() => {
    if (!compass || navView !== "map") return;

    let frame = 0;
    let current = null;
    let target = null;
    let last = null;

    const tick = () => {
      const map = window.__patracNavigationMap;

      if (map && target !== null) {
        if (current === null) current = target;

        const delta = ((target - current + 540) % 360) - 180;
        current = (current + delta * 0.32 + 360) % 360;

        if (
          last === null ||
          Math.abs(((current - last + 540) % 360) - 180) > 0.12
        ) {
          try {
            map.setBearing(current);
            last = current;
          } catch {}
        }
      }

      frame = requestAnimationFrame(tick);
    };

    if (typeof heading === "number") {
      target = heading;
    }

    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, [compass, navView, heading]);

  useEffect(() => {
    const map = window.__patracNavigationMap;
    const target = active?.stops?.[currentIndex];

    if (!map) return;

    const timer = setTimeout(() => {
      try {
        map.resize();

        if (compassPos && target) {
          autoFitNavMap(
            map,
            compassPos,
            { lat: target.lat, lng: target.lng },
            mapFull,
            heading,
            getBaseMapConfig(baseMap).maxzoom
          );
        }
      } catch {}
    }, 120);

    return () => clearTimeout(timer);
  }, [
    mapFull,
    currentIndex,
    active,
    compassPos?.lat,
    compassPos?.lng,
    heading,
    baseMap,
  ]);
}


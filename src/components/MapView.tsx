"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { FeatureCollection, Polygon } from "geojson";

interface SpotProps {
  score: number;
  sun: number;
  wind: number;
  uv: number;
  altitudeDeg: number;
}

type SpotFC = FeatureCollection<Polygon, SpotProps>;

const FALLBACK: [number, number] = [5.32, 60.39]; // Bergen, NO
const SOURCE_ID = "spots";
const FILL_LAYER_ID = "spots-fill";
const OUTLINE_LAYER_ID = "spots-outline";

const COLOR_STOPS: [number, string][] = [
  [0.0, "#dc2626"],
  [0.4, "#f59e0b"],
  [0.7, "#84cc16"],
  [1.0, "#16a34a"],
];

function buildColorExpression(): mapboxgl.ExpressionSpecification {
  const expr: (string | number | unknown[])[] = [
    "interpolate",
    ["linear"],
    ["get", "score"],
    ...COLOR_STOPS.flatMap(([value, color]) => [value, color]),
  ];
  return expr as unknown as mapboxgl.ExpressionSpecification;
}

type Status =
  | { kind: "config" }
  | { kind: "locating" }
  | { kind: "loading"; center: [number, number] }
  | { kind: "ready"; center: [number, number] }
  | { kind: "error"; message: string; center: [number, number] };

type Action =
  | { type: "configured" }
  | { type: "config-missing" }
  | { type: "locating" }
  | { type: "located"; center: [number, number] }
  | { type: "loading"; center: [number, number] }
  | { type: "ready"; center: [number, number] }
  | { type: "error"; message: string; center: [number, number] };

function reducer(state: Status, action: Action): Status {
  switch (action.type) {
    case "configured":
      return { kind: "locating" };
    case "config-missing":
      return {
        kind: "error",
        message: "NEXT_PUBLIC_MAPBOX_TOKEN is not configured on the server.",
        center: FALLBACK,
      };
    case "locating":
      return { kind: "locating" };
    case "located":
      return { kind: "loading", center: action.center };
    case "loading":
      return { kind: "loading", center: action.center };
    case "ready":
      return { kind: "ready", center: action.center };
    case "error":
      return { kind: "error", message: action.message, center: action.center };
  }
}

interface RuntimeConfig {
  mapboxToken: string;
  appName: string;
}

export default function MapView() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [status, dispatch] = useReducer(reducer, { kind: "config" });
  // Storing config as state (not a ref) means the map-mount effect
  // re-runs exactly once when the token arrives, not on every dispatch.
  const [config, setConfig] = useState<RuntimeConfig | null>(null);
  // Flip to true inside map.on("load") so downstream effects (heatmap
  // fetch) can wait for the source/layers to be registered.
  const [mapReady, setMapReady] = useState(false);

  // 1. Fetch runtime config first. If missing, surface the error and stop.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/config", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((cfg: RuntimeConfig) => {
        if (cancelled) return;
        if (!cfg.mapboxToken) {
          dispatch({ type: "config-missing" });
          return;
        }
        setConfig(cfg);
        dispatch({ type: "configured" });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        dispatch({
          type: "error",
          message: `Failed to load config: ${(err as Error).message}`,
          center: FALLBACK,
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 2. Mount the map exactly once, when the token is available.
  useEffect(() => {
    if (!config || !containerRef.current || mapRef.current) return;

    mapboxgl.accessToken = config.mapboxToken;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: FALLBACK,
      zoom: 16,
    });
    mapRef.current = map;

    map.addControl(
      new mapboxgl.NavigationControl({ showCompass: false }),
      "top-right",
    );
    // GeolocateControl without auto-activate; we drive it ourselves.
    map.addControl(
      new mapboxgl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: false,
        showUserHeading: true,
      }),
      "top-right",
    );

    map.on("load", () => {
      setMapReady(true);
      map.addSource(SOURCE_ID, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: FILL_LAYER_ID,
        type: "fill",
        source: SOURCE_ID,
        paint: { "fill-color": buildColorExpression(), "fill-opacity": 0.55 },
      });
      map.addLayer({
        id: OUTLINE_LAYER_ID,
        type: "line",
        source: SOURCE_ID,
        paint: {
          "line-color": "#0f172a",
          "line-width": 0.25,
          "line-opacity": 0.4,
        },
      });

      const popup = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
      });
      map.on("mouseenter", FILL_LAYER_ID, (e) => {
        map.getCanvas().style.cursor = "pointer";
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties as unknown as SpotProps;
        popup
          .setLngLat(e.lngLat)
          .setHTML(
            `<div style="font: 12px/1.3 system-ui, sans-serif; color:#0f172a">
               <div style="font-weight:600; margin-bottom:4px">Score: ${p.score.toFixed(2)}</div>
               <div>Sun: ${p.sun.toFixed(2)}</div>
               <div>Wind: ${p.wind.toFixed(2)}</div>
               <div>UV: ${p.uv.toFixed(2)}</div>
             </div>`,
          )
          .addTo(map);
      });
      map.on("mouseleave", FILL_LAYER_ID, () => {
        map.getCanvas().style.cursor = "";
        popup.remove();
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [config]);

  // 3. Once the map is mounted, try to geolocate the user.
  useEffect(() => {
    if (status.kind !== "locating") return;
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      dispatch({ type: "located", center: FALLBACK });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const center: [number, number] = [
          pos.coords.longitude,
          pos.coords.latitude,
        ];
        mapRef.current?.flyTo({ center, zoom: 17 });
        dispatch({ type: "located", center });
      },
      (err) => {
        dispatch({
          type: "error",
          message: `Geolocation denied (${err.message}). Using fallback.`,
          center: FALLBACK,
        });
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }, [status.kind]);

  // 4. Whenever the center changes (and the map is ready), fetch the
  //    heatmap and push to the source. Gating on mapReady avoids a
  //    race where the fetch effect runs before map.on("load") has
  //    registered the GeoJSON source.
  const center = "center" in status ? status.center : null;
  useEffect(() => {
    if (!center || !mapReady) return;
    const map = mapRef.current;
    if (!map) return;
    const source = map.getSource(SOURCE_ID) as
      | mapboxgl.GeoJSONSource
      | undefined;
    if (!source) return;

    let cancelled = false;
    const ctrl = new AbortController();
    dispatch({ type: "loading", center });

    fetch(
      `/api/spots?lat=${center[1]}&lng=${center[0]}&radius=0.3`,
      { signal: ctrl.signal },
    )
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<SpotFC>;
      })
      .then((fc) => {
        if (cancelled) return;
        source.setData(fc);
        dispatch({ type: "ready", center });
      })
      .catch((err: unknown) => {
        if (cancelled || (err as { name?: string }).name === "AbortError") return;
        dispatch({
          type: "error",
          message: `Failed to load spots: ${(err as Error).message}`,
          center,
        });
      });

    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [center, mapReady]);

  return (
    <div className="relative h-full w-full bg-slate-100">
      <div ref={containerRef} className="h-full w-full" />
      <StatusBar status={status} />
    </div>
  );
}

function StatusBar({ status }: { status: Status }) {
  let label = "Loading config…";
  if (status.kind === "locating") label = "Locating you…";
  else if (status.kind === "loading")
    label = `Loading sunbathing spots @ ${status.center[1].toFixed(4)}, ${status.center[0].toFixed(4)}…`;
  else if (status.kind === "ready")
    label = `Centered at ${status.center[1].toFixed(4)}, ${status.center[0].toFixed(4)}`;
  else if (status.kind === "error") label = status.message;

  return (
    <div className="pointer-events-none absolute top-3 left-3 max-w-[80vw] rounded-full bg-white/90 px-3 py-1.5 text-xs text-slate-800 shadow ring-1 ring-slate-200">
      {label}
    </div>
  );
}

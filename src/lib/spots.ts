import SunCalc from "suncalc";
import {
  buffer,
  point as turfPoint,
  bbox as turfBbox,
  squareGrid,
  centroid,
} from "@turf/turf";
import type { Feature, FeatureCollection, Polygon } from "geojson";

/** Cell side length, in meters. Matches the spec. */
export const CELL_SIZE_METERS = 10;

/** Default search radius around the user, in kilometers. */
export const DEFAULT_RADIUS_KM = 0.3;

export interface SpotProperties {
  score: number;
  sun: number;
  wind: number;
  uv: number;
  altitudeDeg: number;
}

export type SpotFeature = Feature<Polygon, SpotProperties>;
export type SpotFeatureCollection = FeatureCollection<Polygon, SpotProperties>;

/**
 * Placeholder for the Norwegian Meteorological Institute's Frost API
 * (https://api.met.no/weatherapi/frost/). The real implementation should
 * issue a signed GET request to /observations/v0.jsonld with sources
 * for wind (mean wind speed, FF) and UV index (UV).
 *
 * Returning a deterministic mock keeps the heatmap stable per cell so
 * the UI is testable until the real client is wired in.
 */
async function getFrostObservation(
  lat: number,
  lng: number,
  element: "wind" | "uv",
): Promise<number> {
  // TODO: replace with real Frost API call, e.g.
  //   const r = await fetch(
  //     `https://api.met.no/weatherapi/frost/observations/v0.jsonld?` +
  //     new URLSearchParams({
  //       sources: FROST_SOURCES,
  //       elements: element === "wind" ? "mean(wind_speed P1D)" : "mean(uv_index P1D)",
  //       referencetime: new Date().toISOString().slice(0, 10),
  //       lat, lon: String(lng),
  //       level: element === "wind" ? "default" : "surface",
  //     }),
  //     { headers: { Authorization: `Basic ${FROST_TOKEN}` } },
  //   );
  // const json = await r.json();
  // return Number(json.data?.[0]?.observations?.[0]?.value ?? NaN);

  // Deterministic pseudo-random value in [0, 1) based on coords.
  const seed = Math.sin(lat * 12.9898 + lng * 78.233) * 43758.5453;
  const noise = seed - Math.floor(seed);

  if (element === "wind") {
    // Mock: 0..12 m/s, biased toward a gentle breeze.
    return noise * 12;
  }
  // Mock UV index: 0..9.
  return noise * 9;
}

/**
 * Normalize the sun's altitude in degrees into a 0..1 desirability score.
 * Below the horizon => 0. Optimal tanning altitude around 35-50 deg.
 */
function sunScore(altitudeDeg: number): number {
  if (altitudeDeg <= 0) return 0;
  if (altitudeDeg >= 60) return 0.6; // too high => harsh, less pleasant
  // Plateau between 25 and 50 degrees, fading to 0 at the horizon.
  if (altitudeDeg < 25) return altitudeDeg / 25;
  return 1 - Math.abs(altitudeDeg - 37.5) / 22.5;
}

/** Light breeze is ideal; strong wind is uncomfortable. */
function windScore(windMs: number): number {
  if (windMs <= 0.5) return 0.4; // stagnant air feels stuffy
  if (windMs >= 10) return 0;
  // Peak around 2-3 m/s, gentle decline to 0 at 10 m/s.
  const peak = 2.5;
  if (windMs <= peak) return 0.4 + 0.6 * (windMs / peak);
  return 1 - (windMs - peak) / (10 - peak);
}

/** UV index: prefer moderate exposure (4-6), penalize both low and extreme. */
function uvScore(uvIndex: number): number {
  if (uvIndex <= 0) return 0;
  const optimum = 5;
  const tolerance = 4;
  const distance = Math.abs(uvIndex - optimum);
  return Math.max(0, 1 - distance / tolerance);
}

export interface BuildSpotsOptions {
  /** Override the default radius (km). */
  radiusKm?: number;
  /** Use a fixed "now" for deterministic tests. */
  now?: Date;
}

export interface BuildSpotsInput {
  lat: number;
  lng: number;
  options?: BuildSpotsOptions;
}

/**
 * Build a GeoJSON FeatureCollection of square cells, each carrying a
 * sunbathing score in [0, 1]. Stateless: every input produces the same
 * output for a given `now`.
 */
export async function buildSpots({
  lat,
  lng,
  options = {},
}: BuildSpotsInput): Promise<SpotFeatureCollection> {
  const radiusKm = options.radiusKm ?? DEFAULT_RADIUS_KM;
  const now = options.now ?? new Date();

  // Build a bbox around the point and tile it with 10m squares.
  const center = turfPoint([lng, lat]);
  const padded = buffer(center, radiusKm, { units: "kilometers" });
  if (!padded) {
    return { type: "FeatureCollection", features: [] };
  }
  const box = turfBbox(padded);
  const grid = squareGrid(box, CELL_SIZE_METERS, { units: "meters" });

  // Global sun position - same for every cell at this instant.
  const sun = SunCalc.getPosition(now, lat, lng);
  const altitudeDeg = (sun.altitude * 180) / Math.PI;
  const sunScoreValue = sunScore(altitudeDeg);

  // Fetch mocked observations once per request.
  const [windMs, uvIndex] = await Promise.all([
    getFrostObservation(lat, lng, "wind"),
    getFrostObservation(lat, lng, "uv"),
  ]);
  const windScoreValue = windScore(windMs);
  const uvScoreValue = uvScore(uvIndex);

  // Weighted blend: sun dominates, wind and UV break ties.
  const features: SpotFeature[] = grid.features.map((cell) => {
    const c = centroid(cell);
    const [cLng, cLat] = c.geometry.coordinates as [number, number];

    // Small per-cell perturbation so the heatmap has texture.
    const cellSeed = Math.sin(cLat * 91.345 + cLng * 47.853) * 1000;
    const cellNoise = (cellSeed - Math.floor(cellSeed)) * 0.1 - 0.05;

    const score = clamp01(
      0.6 * sunScoreValue + 0.25 * windScoreValue + 0.15 * uvScoreValue + cellNoise,
    );

    return {
      type: "Feature",
      geometry: cell.geometry,
      properties: {
        score,
        sun: sunScoreValue,
        wind: windScoreValue,
        uv: uvScoreValue,
        altitudeDeg,
      },
    };
  });

  return { type: "FeatureCollection", features };
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

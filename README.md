# Tandar

Real-time sunbathing heatmap. A stateless PWA that uses your live GPS
location to render a 10×10 m grid of sunbathing scores (sun + wind + UV).

[![License: MIT](https://img.shields.io/github/license/ErFjeldheim/Tandar?style=flat-square)](./LICENSE)
[![Live](https://img.shields.io/website?url=https%3A%2F%2Ftandar.fjelldata.com&style=flat-square&up_message=tandar.fjelldata.com&down_message=offline&logo=mapbox&label=Live)](https://tandar.fjelldata.com)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js&logoColor=white)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white)](https://tailwindcss.com)
[![Mapbox GL](https://img.shields.io/badge/Mapbox_GL-3-1A73E8?style=flat-square&logo=mapbox&logoColor=white)](https://docs.mapbox.com/mapbox-gl-js)
[![PWA](https://img.shields.io/badge/PWA-installable-5A0FC8?style=flat-square&logo=pwa&logoColor=white)](./public/manifest.webmanifest)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?style=flat-square&logo=docker&logoColor=white)](./Dockerfile)

## Stack

- Next.js 16 (App Router, `output: "standalone"`)
- TypeScript, Tailwind CSS v4
- Mapbox GL JS (vector tiles + `flyTo`)
- `@turf/turf` (10 m grid generation) + `suncalc` (sun position)
- Mapbox Geocoding API for the search bar
- Norwegian Meteorological Institute **Frost** API (mocked; plug-in point ready)
- PWA: web manifest + minimal network-first service worker
- Single-container Docker, non-root, healthcheck, deployed on Dokploy

## Project layout

```
src/
  app/
    api/config/route.ts     # GET /api/config  -> public runtime config
    api/spots/route.ts      # GET /api/spots?lat=&lng=&radius=
    layout.tsx              # root layout + viewport + PWA meta
    page.tsx                # map host
  components/
    MapView.tsx             # client: Mapbox + GeoJSON fill layer + geolocation
    LocationSearch.tsx      # client: Mapbox Geocoding + lat,lng input
    ServiceWorkerRegistrar.tsx
  lib/
    spots.ts                # stateless scoring: turf + suncalc + Frost mock
public/
  manifest.webmanifest
  icon.svg
  sw.js                     # network-first SW, /api never cached
Dockerfile                  # multi-stage, standalone, non-root, healthcheck
docker-compose.yml          # for Dokploy / any single-host Docker
```

## Local development

```bash
cp .env.example .env.local      # add your Mapbox token
npm install
npm run dev
```

Open http://localhost:3000 — the browser will ask for location, then
fetch `/api/config` and `/api/spots?lat=…&lng=…` and render the heatmap.
Use the search bar at the top of the map to check a different place.

## API

Both routes are stateless and dynamic (no caching of the response
body, only short edge caching is appropriate for `/api/spots`).

### `GET /api/config`

Returns the public runtime config (currently just the Mapbox public
token). Read by the client on mount, so tokens can be rotated without
rebuilding.

```bash
curl https://tandar.fjelldata.com/api/config
# {"mapboxToken":"pk....","appName":"Tandar"}
```

### `GET /api/spots?lat={lat}&lng={lng}&radius={km}`

Returns a `FeatureCollection<Polygon>` with a `score` (0..1) on every
10 m cell. Inputs are validated server-side.

```bash
curl 'https://tandar.fjelldata.com/api/spots?lat=60.39&lng=5.32&radius=0.3' | jq '.features[0]'
```

## Deployment (Dokploy)

A single image, exposed on port 3000, behind Dokploy's Traefik.

1. Push the repo to GitHub.
2. In Dokploy, create a new **Application** of type **Dockerfile**
   pointing at this repo (Dockerfile path `./Dockerfile`).
3. Set the environment variables in the **Environment** tab (see
   `.env.example`):
   - `NEXT_PUBLIC_MAPBOX_TOKEN` — public token, read at runtime by
     `/api/config`. Setting it in the **runtime** env is enough; it
     does not need to be present at build time.
   - `FROST_CLIENT_ID` / `FROST_CLIENT_SECRET` — optional, server-side
     only, used by `src/lib/spots.ts:33` when you swap the mock for the
     real Frost client.
4. Map a public domain (e.g. `tandar.fjelldata.com`) in the
   **Domains** tab — Let's Encrypt is issued automatically.
5. Trigger a deploy. The standalone Next.js server listens on `:3000`
   inside the container; Dokploy's Traefik routes `443 → 3000`.

Health check: `GET /` (Dokploy polls the container's `HEALTHCHECK`).

# Tandar

Real-time sunbathing heatmap. A stateless PWA that uses your live GPS
location to render a 10×10 m grid of sunbathing scores (sun + wind + UV).

## Stack

- Next.js 16 (App Router, standalone output)
- TypeScript, Tailwind CSS v4
- Mapbox GL JS
- `@turf/turf` (grid generation) + `suncalc` (sun position)
- PWA: web manifest + minimal service worker

## Project layout

```
src/
  app/
    api/spots/route.ts   # GET /api/spots?lat=&lng=&radius=
    layout.tsx           # root layout + viewport + PWA meta
    page.tsx             # map host
  components/
    MapView.tsx          # client: Mapbox + GeoJSON fill layer + geolocation
    ServiceWorkerRegistrar.tsx
  lib/
    spots.ts             # stateless scoring: turf + suncalc + Frost mock
public/
  manifest.webmanifest
  icon.svg
  sw.js                  # network-first SW, no /api caching
Dockerfile               # multi-stage, non-root, healthcheck on :3000
docker-compose.yml       # for Dokploy / any single-host Docker
```

## Local development

```bash
cp .env.example .env.local      # add your Mapbox token
npm install
npm run dev
```

Open http://localhost:3000 — the browser will ask for location, then
fetch `/api/spots?lat=…&lng=…` and render the heatmap.

## API

### `GET /api/spots?lat={lat}&lng={lng}&radius={km}`

Returns a `FeatureCollection<Polygon>` with a `score` (0..1) on every
cell. Validation is enforced server-side. Response is cached for 30 s.

```bash
curl 'http://localhost:3000/api/spots?lat=60.39&lng=5.32&radius=0.3' | jq '.features[0]'
```

## Deployment (Dokploy)

A single image, exposed on port 3000, behind Dokploy's Traefik.

1. Push the repo to GitHub.
2. In Dokploy, create a new **Application** of type **Docker Compose**
   pointing at this repo (Dockerfile path `./Dockerfile`,
   compose path `./docker-compose.yml`).
3. Set the environment variables (see `.env.example`):
   - `NEXT_PUBLIC_MAPBOX_TOKEN` (required by the browser bundle)
   - `FROST_CLIENT_ID` / `FROST_CLIENT_SECRET` (optional, for real data)
4. Map a public domain (e.g. `tandar.fjelldata.com`) in the Dokploy
   **Domains** tab — it will issue a Let's Encrypt cert automatically.
5. Trigger a deploy. The standalone Next.js server listens on `:3000`
   inside the container; Dokploy's Traefik routes `443 → 3000`.

Health check: `GET /` (Dokploy polls the container's `HEALTHCHECK`).

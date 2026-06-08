import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Public runtime config. Returns only non-secret values that the client
 * bundle needs (e.g. the Mapbox public token). Keeping these out of the
 * build means we don't need build-time env plumbing for NEXT_PUBLIC_*.
 */
export function GET() {
  return NextResponse.json(
    {
      mapboxToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "",
      appName: process.env.NEXT_PUBLIC_APP_NAME ?? "Tandar",
    },
    {
      headers: {
        // Don't cache the config in the browser; lets the token rotate
        // without needing a rebuild.
        "Cache-Control": "no-store",
      },
    },
  );
}

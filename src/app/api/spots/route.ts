import { NextRequest, NextResponse } from "next/server";
import { buildSpots } from "@/lib/spots";

export const dynamic = "force-dynamic";

function parseCoord(raw: string | null): number | null {
  if (raw == null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return n;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const lat = parseCoord(searchParams.get("lat"));
  const lng = parseCoord(searchParams.get("lng"));
  const radiusKm = parseCoord(searchParams.get("radius"));

  if (lat == null || lng == null) {
    return NextResponse.json(
      { error: "Missing or invalid `lat` / `lng` query parameters." },
      { status: 400 },
    );
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json(
      { error: "`lat` must be in [-90, 90] and `lng` in [-180, 180]." },
      { status: 400 },
    );
  }
  if (radiusKm != null && (radiusKm <= 0 || radiusKm > 5)) {
    return NextResponse.json(
      { error: "`radius` must be in (0, 5] km." },
      { status: 400 },
    );
  }

  const fc = await buildSpots({
    lat,
    lng,
    options: { radiusKm: radiusKm ?? undefined },
  });

  return NextResponse.json(fc, {
    headers: {
      "Cache-Control": "public, max-age=30, s-maxage=30",
    },
  });
}

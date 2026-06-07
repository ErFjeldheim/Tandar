import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Mapbox GL ships an untranspiled CJS bundle; transpile it for the client.
  transpilePackages: ["mapbox-gl"],
  // Don't fail the prod build if the public token is missing -
  // the UI handles it gracefully.
  env: {
    NEXT_PUBLIC_APP_NAME: "Tandar",
  },
};

export default nextConfig;

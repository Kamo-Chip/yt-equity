import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  transpilePackages: ["@yt-equity/contracts"],
  cacheComponents: true,
  partialPrefetching: true,
  allowedDevOrigins: ["127.0.0.1"],
  // The floating dev badge overlaps the canvas controls. Error overlays remain enabled.
  devIndicators: false,
};
export default nextConfig;

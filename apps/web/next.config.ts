import { loadEnvConfig } from "@next/env";
import { resolve } from "node:path";
import type { NextConfig } from "next";
loadEnvConfig(resolve(process.cwd(), "../.."));
const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  async headers() {
    return ["/admin/:path*", "/moderator/:path*", "/workspace/:path*", "/api/:path*", "/health/:path*"].map((source) => ({
      source,
      headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }],
    }));
  },
  transpilePackages: ["@yt-equity/contracts"],
  cacheComponents: true,
  partialPrefetching: true,
  allowedDevOrigins: ["127.0.0.1"],
  // The floating dev badge overlaps the canvas controls. Error overlays remain enabled.
  devIndicators: false,
};
export default nextConfig;

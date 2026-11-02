import type { NextConfig } from "next";

// API requests are proxied by web/app/api/[...path]/route.ts instead of a
// rewrite here, so the shared API key can be attached server-side. See
// web/lib/api-key.ts.
const nextConfig: NextConfig = {
  output: "standalone",
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // Runtime credentials belong to the user's data directory, never a distributable bundle.
  outputFileTracingExcludes: {"*": ["../data/**", "**/.api-key", "**/.env", "**/.env.local", "../outputs/**"]},
};

export default nextConfig;

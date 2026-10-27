import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  distDir: 'out',
  assetPrefix: './',
  images: {
    unoptimized: true,
  },
  // Fixed ID makes builds reproducible, so the committed web/out can be checked
  // for staleness; asset filenames are still content-hashed.
  generateBuildId: async () => 'dsf',
};

export default nextConfig;

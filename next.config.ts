import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // Pages already visited open instantly for the next minute instead of being
    // fetched again. They cannot go stale: whenever anything changes, the live
    // update (LiveRefresh) reloads the open page and clears these kept copies.
    staleTimes: { dynamic: 60, static: 300 },
  },
};

export default nextConfig;

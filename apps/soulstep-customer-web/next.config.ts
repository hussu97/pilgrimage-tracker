import type { NextConfig } from 'next';
import path from 'path';

const backendOrigin = process.env.NEXT_PUBLIC_PROXY_TARGET || 'http://127.0.0.1:3000';

const nextConfig: NextConfig = {
  // Standalone output for Docker/Cloud Run — creates .next/standalone with a
  // self-contained Node.js server. Required for SSR on Cloud Run.
  output: 'standalone',

  // Pin output file tracing to this package so Next.js doesn't walk up to the
  // monorepo root and get confused by multiple lockfiles.
  outputFileTracingRoot: path.join(__dirname, '../..'),

  // Serve static files from public/ as-is
  // API calls are proxied to the backend in dev via rewrites
  async rewrites() {
    if (process.env.NODE_ENV !== 'development') return [];
    return [
      {
        source: '/api/:path*',
        destination: `${backendOrigin}/api/:path*`,
      },
      {
        source: '/umami/:path*',
        destination: `https://cloud.umami.is/:path*`,
      },
    ];
  },

  // Allow cross-origin images from the backend and CDN
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.run.app' },
      { protocol: 'https', hostname: 'soul-step.org' },
      { protocol: 'https', hostname: '**.soul-step.org' },
    ],
  },

  // Transpile leaflet so server-side bundling doesn't choke on ESM / CSS imports
  transpilePackages: ['leaflet', 'react-leaflet', 'react-leaflet-cluster'],

  // Keep React 19 strict mode
  reactStrictMode: true,

  webpack(config) {
    return config;
  },
};

export default nextConfig;

import type { NextConfig } from 'next';
import fs from 'fs';
import path from 'path';

const backendOrigin = process.env.NEXT_PUBLIC_PROXY_TARGET || 'http://127.0.0.1:3000';

const nextConfig: NextConfig = {
  // Standalone output for Docker/Cloud Run — creates .next/standalone with a
  // self-contained Node.js server. Required for SSR on Cloud Run.
  output: 'standalone',

  // Pin output file tracing to the monorepo root so Next.js doesn't get confused
  // by multiple lockfiles. Only set when the monorepo structure is present (local
  // dev / CI); omitted in Docker where only the app directory is copied.
  ...(fs.existsSync(path.join(__dirname, '../../apps')) && {
    outputFileTracingRoot: path.join(__dirname, '../..'),
  }),

  // Rewrite rules:
  //   /sitemap.xml, /feed.xml, /feed.atom → proxy route handlers (all envs)
  //   /api/*, /umami/* → backend / Umami (dev only)
  async rewrites() {
    const always = [
      // Proxy sitemap and feeds from main domain so GSC and feed readers work
      { source: '/sitemap.xml', destination: '/api/sitemap' },
      { source: '/feed.xml', destination: '/api/feed-xml' },
      { source: '/feed.atom', destination: '/api/feed-atom' },
    ];

    if (process.env.NODE_ENV !== 'development') return always;

    return [
      ...always,
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

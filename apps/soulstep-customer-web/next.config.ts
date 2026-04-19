import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

// In dev, proxy to local backend. In production, proxy to the public API.
const backendOrigin =
  process.env.NODE_ENV === 'development'
    ? process.env.NEXT_PUBLIC_PROXY_TARGET || 'http://127.0.0.1:3000'
    : process.env.NEXT_PUBLIC_API_BASE_URL || 'https://catalog-api.soul-step.org';

const nextConfig: NextConfig = {
  // Rewrite rules:
  //   /sitemap.xml, /feed.xml, /feed.atom → internal Next.js route handlers (all envs)
  //   /llms.txt, /openapi.json, /.well-known/*, /share/* → backend proxy (all envs)
  //   /api/v1/*                           → backend proxy (all envs)
  //   /umami/*                            → Umami cloud (dev only)
  async rewrites() {
    const always = [
      // Proxy sitemap and feeds from main domain so GSC and feed readers work
      { source: '/sitemap.xml', destination: '/api/sitemap' },
      { source: '/feed.xml', destination: '/api/feed-xml' },
      { source: '/feed.atom', destination: '/api/feed-atom' },
      // SEO/GEO crawler content — route through soul-step.org, never the api subdomain
      { source: '/llms.txt',           destination: `${backendOrigin}/llms.txt` },
      { source: '/llms-full.txt',      destination: `${backendOrigin}/llms-full.txt` },
      { source: '/openapi.json',       destination: `${backendOrigin}/openapi.json` },
      { source: '/.well-known/:path*', destination: `${backendOrigin}/.well-known/:path*` },
      { source: '/share/:path*',       destination: `${backendOrigin}/share/:path*` },
      // Proxy all backend API calls in every environment.
      // Scoped to /api/v1/ so internal Next.js handlers (/api/sitemap etc.) are unaffected.
      {
        source: '/api/v1/:path*',
        destination: `${backendOrigin}/api/v1/:path*`,
      },
    ];

    if (process.env.NODE_ENV !== 'development') return always;

    return [
      ...always,
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

export default withSentryConfig(nextConfig, {
  silent: true,
  sourcemaps: { disable: true },
  disableLogger: true,
});

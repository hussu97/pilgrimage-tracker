import type { NextConfig } from 'next';

const backendOrigin = process.env.NEXT_PUBLIC_PROXY_TARGET || 'http://127.0.0.1:3000';

const nextConfig: NextConfig = {
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

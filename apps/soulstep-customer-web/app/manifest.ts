import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SoulStep',
    short_name: 'SoulStep',
    description: 'Track your pilgrimages and discover sacred places.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#EAD9C0',
    theme_color: '#AB553E',
    lang: 'en',
    icons: [
      {
        src: '/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/favicon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}

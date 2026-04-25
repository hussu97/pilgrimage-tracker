import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

// Use 127.0.0.1 so connections hit IPv4; localhost can resolve to ::1 and fail if server binds to 127.0.0.1 (macOS).
const backendOrigin = process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:3000';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'SoulStep',
        short_name: 'SoulStep',
        description: 'Track your pilgrimages and discover sacred places',
        theme_color: '#B0563D',
        background_color: '#F5F0E9',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/logo.png', type: 'image/png', sizes: 'any', purpose: 'any' },
          { src: '/logo.png', type: 'image/png', sizes: '192x192', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Exclude html so the SW never serves a stale index.html from precache.
        // Navigation requests use NetworkFirst (below) so the shell is always
        // fetched fresh; the SW only caches hashed JS/CSS/asset files.
        globPatterns: ['**/*.{js,css,ico,png,svg,woff2}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        // Ensure API calls are never intercepted by the SW
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'navigations',
              networkTimeoutSeconds: 3,
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: backendOrigin,
        changeOrigin: true,
      },
      '/umami': {
        target: 'https://cloud.umami.is',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/umami/, ''),
      },
    },
  },
});

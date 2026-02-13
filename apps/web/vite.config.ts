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
        name: 'Pilgrimage Tracker',
        short_name: 'Pilgrimage',
        description: 'Track your pilgrimages and discover places',
        theme_color: '#0d9488',
        background_color: '#f8fafc',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/favicon.svg', type: 'image/svg+xml', sizes: 'any', purpose: 'any' },
          { src: '/favicon.svg', type: 'image/svg+xml', sizes: '192x192', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: '/index.html',
      },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: backendOrigin,
        changeOrigin: true,
      },
    },
  },
});

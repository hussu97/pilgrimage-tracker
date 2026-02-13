import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Use 127.0.0.1 so connections hit IPv4; localhost can resolve to ::1 and fail if server binds to 127.0.0.1 (macOS).
const backendOrigin = process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:3000';

export default defineConfig({
  plugins: [react()],
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

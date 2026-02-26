/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['node_modules/**', 'dist/**', 'e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage',
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 85,
        statements: 85,
      },
      exclude: [
        'node_modules/**',
        'dist/**',
        'coverage/**',
        'src/main.tsx',
        '**/*.d.ts',
        'vitest.config.ts',
        'vite.config.ts',
        'postcss.config.js',
        'tailwind.config.js',
        // API client uses fetch and is covered by integration/e2e tests, not unit coverage
        'src/lib/api/client.ts',
      ],
    },
  },
});

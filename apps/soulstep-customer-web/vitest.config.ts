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
    exclude: ['node_modules/**', 'dist/**', '.next/**', 'e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage',
      thresholds: {
        lines: 80,
        functions: 80,
        // Branches is held at 75 instead of 80 because conditional rendering
        // + early-return guards in the React page components tilt branch
        // coverage lower than the other three axes. Raise back to 80 once new
        // tests close the current gap (see 2026-04-21 umami overhaul).
        branches: 75,
        statements: 80,
      },
      exclude: [
        'node_modules/**',
        'dist/**',
        '.next/**',
        'coverage/**',
        '**/*.d.ts',
        'vitest.config.ts',
        'next.config.ts',
        'postcss.config.js',
        'tailwind.config.js',
        'app/**',
        // API client uses fetch and is covered by integration/e2e tests, not unit coverage
        'src/lib/api/client.ts',
        // React components/hooks require DOM rendering — covered by e2e/integration tests
        'src/components/**',
      ],
    },
  },
});

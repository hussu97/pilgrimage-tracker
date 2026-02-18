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
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage',
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 60,
        statements: 60,
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
      ],
    },
  },
});

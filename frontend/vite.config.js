import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// TESSERA frontend — Phase 8A foundation.
// API base URL is environment-driven (see .env.example); never hardcoded.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.{test,spec}.{js,jsx}'],
    testTimeout: 15000,
  },
});

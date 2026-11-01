import { defineConfig } from 'vite';

// base './' damit der Build später direkt in Capacitor (iOS) läuft
export default defineConfig({
  base: './',
  server: { port: 5173 },
  build: { target: 'es2020', chunkSizeWarningLimit: 1500 },
});

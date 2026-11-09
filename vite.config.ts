import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  base: './',
  plugins: [preact()],
  optimizeDeps: { exclude: ['maplibre-gl'] },
  build: { target: 'es2020', chunkSizeWarningLimit: 2500 },
  server: { host: true }
});

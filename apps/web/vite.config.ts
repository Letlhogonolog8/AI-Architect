import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Vite configuration.
 *
 * The dev server proxies `/api` and `/realtime` to the API so the browser sees
 * a single origin locally. That keeps the refresh cookie first-party in
 * development without loosening `sameSite`, which is exactly how it behaves in
 * production behind the shared ingress.
 */
const API_TARGET = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:4000';

export default defineConfig({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
    // The workspace packages are consumed as source; without deduping, Vite can
    // resolve two React copies and hooks break at runtime.
    dedupe: ['react', 'react-dom'],
  },

  server: {
    port: 5173,
    strictPort: true,
    host: true,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
      '/realtime': { target: API_TARGET, changeOrigin: true, ws: true },
    },
  },

  preview: { port: 4173, host: true },

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      output: {
        // The map and charting layers are heavy and not needed to render the
        // login screen, so they are split out of the entry chunk.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router'],
          query: ['@tanstack/react-query'],
          motion: ['framer-motion'],
        },
      },
    },
  },
});

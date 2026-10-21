import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // The dev server forwards /api to Express, so the browser sees a single origin:
    // no CORS preflights in development and the refresh-token cookie just works.
    proxy: {
      // 127.0.0.1 (not "localhost") avoids Node picking IPv6 ::1 first on Windows.
      '/api': { target: 'http://127.0.0.1:5000', changeOrigin: true },
    },
  },
  test: {
    environment: 'node',
  },
});

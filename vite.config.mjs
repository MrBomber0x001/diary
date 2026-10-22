import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: false,
  server: {
    host: '127.0.0.1',
    proxy: {
      '/api': 'http://127.0.0.1:4178',
      '/uploads': 'http://127.0.0.1:4178',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});

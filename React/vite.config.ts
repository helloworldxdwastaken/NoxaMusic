import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  // Use relative paths for Capacitor mobile app
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    host: true, // Expose to all network interfaces
    proxy: {
      '/api': {
        target: 'http://100.109.142.120:3001',
        changeOrigin: true,
      },
      '/music_lib': {
        target: 'http://100.109.142.120:3001',
        changeOrigin: true,
      },
      '/artwork_cache': {
        target: 'http://100.109.142.120:3001',
        changeOrigin: true,
      },
      '/images': {
        target: 'http://100.109.142.120:3001',
        changeOrigin: true,
      },
    },
  },
});


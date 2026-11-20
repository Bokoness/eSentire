import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: {
    port: 5173,
    // In development the browser talks only to Vite; /api is forwarded to Express.
    proxy: { '/api': 'http://localhost:3001' },
  },
});

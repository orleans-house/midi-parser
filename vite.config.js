import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages配信時のベースパス（ビルド時のみ適用）
  base: process.env.NODE_ENV === 'production' ? '/midi-parser/' : '/',
  build: {
    outDir: 'dist',
  },
  server: {
    port: 3000,
    open: false,
  },
});

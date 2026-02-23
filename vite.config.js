import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.js', 'tests/integration/**/*.test.js'],
    setupFiles: ['tests/unit/setup-dom.js'],
  },
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

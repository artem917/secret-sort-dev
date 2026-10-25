import { defineConfig } from 'vite';

export default defineConfig({
  root: 'experimental/v05',
  base: '/secret-sort-dev/v05/',
  publicDir: '../../public',
  build: { outDir: '../../dist/v05', emptyOutDir: true },
});

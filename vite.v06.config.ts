import { defineConfig } from 'vite';

export default defineConfig({
  root: 'experimental/v06',
  base: '/secret-sort-dev/v06/',
  publicDir: '../../public',
  build: { outDir: '../../dist/v06', emptyOutDir: true },
});

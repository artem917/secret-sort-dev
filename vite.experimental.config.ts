import { defineConfig } from 'vite';

// Build separately: the stable root bundle must stay byte-for-byte v0.3.
export default defineConfig({
  root: 'experimental/v04',
  base: '/secret-sort-dev/v04/',
  publicDir: '../../public',
  build: { outDir: '../../dist/v04', emptyOutDir: true },
});

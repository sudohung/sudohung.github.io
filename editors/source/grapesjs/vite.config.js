import { defineConfig } from 'vite';

export default defineConfig({
  base: '/mailchimp/grapesjs/',
  build: { outDir: 'dist', emptyOutDir: true },
});

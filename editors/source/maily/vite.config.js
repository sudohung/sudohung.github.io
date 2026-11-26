import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/mailchimp/maily/',
  build: { outDir: 'dist', emptyOutDir: true },
});

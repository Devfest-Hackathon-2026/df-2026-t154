import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    license: { fileName: 'THIRD_PARTY_NOTICES.txt' },
    rolldownOptions: {
      output: {
        postBanner: '/*! Third-party licenses: /THIRD_PARTY_NOTICES.txt */',
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:8080',
    },
  },
});

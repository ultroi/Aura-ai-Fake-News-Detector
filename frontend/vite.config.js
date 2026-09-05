import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: '.',
  publicDir: 'public',
  define: {
    __BUNDLED_DEV__: false,
  },
  server: {
    port: 3000,
    host: 'localhost',
    strictPort: false,
  },
});


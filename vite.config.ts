import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    base: './',
    worker: { format: 'es' as const },
    plugins: [react(), tailwindcss()],
    resolve: {
      dedupe: ['react', 'react-dom'],
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    optimizeDeps: { entries: ['index.html'] },
    server: {
      host: '0.0.0.0',
      port: 3000,
    },
  };
});


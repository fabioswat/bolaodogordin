import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

// Usa a mesma PORT do .env que o servidor, para o proxy de /api.
const envFile = path.resolve(import.meta.dirname, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);
const apiPort = process.env.PORT || 3000;

export default defineConfig({
  root: path.resolve(import.meta.dirname, 'src/web'),
  plugins: [react(), tailwindcss()],
  // Versão do package.json exibida no rodapé.
  define: {
    __APP_VERSION__: JSON.stringify(JSON.parse(readFileSync(path.resolve(import.meta.dirname, 'package.json'), 'utf8')).version),
  },
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/web'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: `http://localhost:${apiPort}`, changeOrigin: false },
    },
  },
});

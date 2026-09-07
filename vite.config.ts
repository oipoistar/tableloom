import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
export default defineConfig({ plugins: [vue()], publicDir: false, base: './', server: { port: 5173, strictPort: true }, build: { chunkSizeWarningLimit: 900 } });

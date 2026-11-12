// Standalone build for the OCR benchmark page. Separate from the app's
// vite.config.js, so the benchmark never enters the QuoteKeeper bundle or PWA.
//
//   npm run bench:ocr        build + serve on http://localhost:5174 (localhost only)
//
// The preview server serves files byte-for-byte (no dev-server transforms), so
// download sizes and load times resemble static production hosting.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  publicDir: 'public',
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 2000 },
  preview: { host: '127.0.0.1', port: 5174, strictPort: true },
});

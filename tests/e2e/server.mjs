// Serves the real app with Firebase replaced by in-memory mocks.
//
// Two modes:
//   dev (default)  Vite dev server: fast, used by `npm run test:e2e`.
//   built          A real production `vite build` (minified, hashed lazy chunks,
//                  production asset paths) served by Vite's preview server:
//                  `npm run test:e2e:build`. Output goes to tests/e2e/.dist.
//
// Safety: `firebase/app`, `firebase/auth` and `firebase/firestore` are aliased to
// ./mocks, and `envDir` points at this folder (which has no .env), so the real
// Firebase config is never loaded and nothing can reach a real project.
// The built mode leaves out the PWA plugin, so no service worker is registered.

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { build, createServer, preview } from 'vite';
import { ocrAssetsPlugin } from '../../scripts/ocr-assets.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const outDir = join(here, '.dist');

const appConfig = () => ({
  root: repo,
  configFile: false,
  envDir: here,
  // Same OCR model list as the app's vite.config.js.
  plugins: [react(), ocrAssetsPlugin({ models: ['best_int'] })],
  resolve: {
    alias: [
      { find: /^firebase\/app$/, replacement: join(here, 'mocks/firebase-app.js') },
      { find: /^firebase\/auth$/, replacement: join(here, 'mocks/firebase-auth.js') },
      { find: /^firebase\/firestore$/, replacement: join(here, 'mocks/firebase-firestore.js') },
    ],
  },
  logLevel: 'warn',
});

export async function startServer({
  port = Number(process.env.E2E_PORT) || 5199,
  built = process.env.E2E_BUILD === '1',
} = {}) {
  // The OCR Lab was retired in Sprint 2A.1. Its old allowlist variable is still set
  // here (for the mock user) so the suite proves it no longer unlocks anything.
  process.env.VITE_SMARTSCAN_LAB_UIDS = 'test-uid-123';
  const url = `http://127.0.0.1:${port}/`;

  if (built) {
    await build({ ...appConfig(), build: { outDir, emptyOutDir: true, chunkSizeWarningLimit: 2000 } });
    const server = await preview({
      root: repo,
      configFile: false,
      build: { outDir },
      preview: { port, strictPort: true, host: '127.0.0.1' },
      logLevel: 'warn',
    });
    return { url, mode: 'production build', close: () => new Promise((done) => {
      server.httpServer.close(done);
      server.httpServer.closeAllConnections?.();
    }) };
  }

  const server = await createServer({ ...appConfig(), server: { port, strictPort: true, host: '127.0.0.1' } });
  await server.listen();
  return { url, mode: 'dev server', close: () => server.close() };
}

// `node tests/e2e/server.mjs` keeps the mocked app running for manual poking.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const { url, mode } = await startServer();
  console.log(`Mocked QuoteKeeper (${mode}) running at ${url} (Ctrl+C to stop)`);
}

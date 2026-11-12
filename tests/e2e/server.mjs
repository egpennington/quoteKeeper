// Dev server for the real app with Firebase replaced by in-memory mocks.
//
// Safety: `firebase/app`, `firebase/auth` and `firebase/firestore` are aliased to
// ./mocks, and `envDir` points at this folder (which has no .env), so the real
// Firebase config is never loaded and nothing can reach a real project.

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';
import { ocrAssetsPlugin } from '../../scripts/ocr-assets.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');

export const LAB_TEST_UID = 'test-uid-123'; // matches mocks/firebase-auth.js

export async function startServer({ port = Number(process.env.E2E_PORT) || 5199 } = {}) {
  process.env.VITE_SMARTSCAN_LAB_UIDS = LAB_TEST_UID; // let the mock user open the OCR Lab
  const server = await createServer({
    root: repo,
    configFile: false,
    envDir: here,
    plugins: [react(), ocrAssetsPlugin({ models: ['fast', 'best_int'] })],
    resolve: {
      alias: [
        { find: /^firebase\/app$/, replacement: join(here, 'mocks/firebase-app.js') },
        { find: /^firebase\/auth$/, replacement: join(here, 'mocks/firebase-auth.js') },
        { find: /^firebase\/firestore$/, replacement: join(here, 'mocks/firebase-firestore.js') },
      ],
    },
    server: { port, strictPort: true, host: '127.0.0.1' },
    logLevel: 'warn',
  });
  await server.listen();
  return { url: `http://127.0.0.1:${port}/`, close: () => server.close() };
}

// `node tests/e2e/server.mjs` keeps the mocked app running for manual poking.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const { url } = await startServer();
  console.log(`Mocked QuoteKeeper running at ${url} (Ctrl+C to stop)`);
}

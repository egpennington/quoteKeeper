// Prepares the self-hosted assets for the Sprint 2A-0 OCR benchmark in
// benchmark/ocr/public/ (gitignored):
//   vendor/worker.min.js            Tesseract.js worker (from node_modules)
//   vendor/core/*.wasm.js           Tesseract.js-core LSTM builds (from node_modules)
//   models/<id>/eng.traineddata.gz  English models, downloaded and SHA-256 verified
//
//   node benchmark/ocr/prepare-assets.mjs

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(here, '..', '..');
const publicDir = join(here, 'public');

// ---- Engine files (copied from the installed packages) ----------------------

const CORE_FILES = [
  'tesseract-core-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-relaxedsimd-lstm.wasm.js',
];
mkdirSync(join(publicDir, 'vendor', 'core'), { recursive: true });
copyFileSync(
  join(projectRoot, 'node_modules', 'tesseract.js', 'dist', 'worker.min.js'),
  join(publicDir, 'vendor', 'worker.min.js'),
);
for (const f of CORE_FILES) {
  copyFileSync(join(projectRoot, 'node_modules', 'tesseract.js-core', f), join(publicDir, 'vendor', 'core', f));
}
console.log('✓ engine: worker + core copied from node_modules');

// ---- Models -------------------------------------------------------------------

const MODELS = [
  {
    id: 'fast',
    url: 'https://github.com/tesseract-ocr/tessdata_fast/raw/main/eng.traineddata',
    gzipped: false,
    sha256: '7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2',
  },
  {
    id: 'best_int',
    url: 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int/eng.traineddata.gz',
    gzipped: true,
    sha256: '45b4cb346724ac1774f1c36f42f182b887bcdb28ebe63e6fff90ac41f3fcff91',
  },
  {
    id: 'best',
    url: 'https://github.com/tesseract-ocr/tessdata_best/raw/main/eng.traineddata',
    gzipped: false,
    sha256: '8280aed0782fe27257a68ea10fe7ef324ca0f8d85bd2fd145d1c2b560bcb66ba',
  },
];

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

for (const model of MODELS) {
  const outDir = join(publicDir, 'models', model.id);
  const outFile = join(outDir, 'eng.traineddata.gz');

  if (existsSync(outFile)) {
    const stored = readFileSync(outFile);
    const check = model.gzipped ? sha256(stored) : sha256(gunzipSync(stored));
    if (check === model.sha256) {
      console.log(`✓ ${model.id}: already present`);
      continue;
    }
  }

  console.log(`↓ ${model.id}: ${model.url}`);
  const res = await fetch(model.url);
  if (!res.ok) throw new Error(`${model.id}: HTTP ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());

  const actual = sha256(bytes);
  if (actual !== model.sha256) {
    throw new Error(`${model.id}: checksum mismatch\n  expected ${model.sha256}\n  actual   ${actual}`);
  }

  mkdirSync(outDir, { recursive: true });
  writeFileSync(outFile, model.gzipped ? bytes : gzipSync(bytes, { level: 9 }));
  console.log(`✓ ${model.id}: saved`);
}

console.log('Benchmark assets ready.');

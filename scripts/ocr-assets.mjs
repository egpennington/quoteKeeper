// Prepares self-hosted Tesseract.js assets (worker, engine, English models).
// Used by the app's Vite build (OCR Lab) and by the standalone benchmark.
//
// Layout written to `targetDir`:
//   worker.min.js                     Tesseract.js worker      (copied from node_modules)
//   core/tesseract-core-*.wasm.js     LSTM engine builds        (copied from node_modules)
//   models/<id>/eng.traineddata.gz    English models            (downloaded, SHA-256 verified)
//
// Models are cached in node_modules/.cache/ocr-models so repeat builds don't re-download.

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = join(projectRoot, 'node_modules', '.cache', 'ocr-models');

export const CORE_FILES = [
  'tesseract-core-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-relaxedsimd-lstm.wasm.js',
];

export const MODELS = {
  fast: {
    url: 'https://github.com/tesseract-ocr/tessdata_fast/raw/main/eng.traineddata',
    gzipped: false,
    sha256: '7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2',
  },
  best_int: {
    url: 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int/eng.traineddata.gz',
    gzipped: true,
    sha256: '45b4cb346724ac1774f1c36f42f182b887bcdb28ebe63e6fff90ac41f3fcff91',
  },
  // Benchmark diagnostic only: crashes on SIMD builds and is 6-8x slower.
  best: {
    url: 'https://github.com/tesseract-ocr/tessdata_best/raw/main/eng.traineddata',
    gzipped: false,
    sha256: '8280aed0782fe27257a68ea10fe7ef324ca0f8d85bd2fd145d1c2b560bcb66ba',
  },
};

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** Returns the gzipped model bytes, verified, from cache or network. */
async function loadModel(id, log) {
  const model = MODELS[id];
  if (!model) throw new Error(`Unknown OCR model "${id}"`);
  const cached = join(cacheDir, `${id}.traineddata.gz`);

  if (existsSync(cached)) {
    const stored = readFileSync(cached);
    const check = model.gzipped ? sha256(stored) : sha256(gunzipSync(stored));
    if (check === model.sha256) return stored;
    log(`OCR model ${id}: cached copy failed checksum, re-downloading`);
  }

  log(`OCR model ${id}: downloading ${model.url}`);
  const res = await fetch(model.url);
  if (!res.ok) throw new Error(`OCR model ${id}: HTTP ${res.status} from ${model.url}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const actual = sha256(bytes);
  if (actual !== model.sha256) {
    throw new Error(`OCR model ${id}: checksum mismatch (expected ${model.sha256}, got ${actual})`);
  }
  const gz = model.gzipped ? bytes : gzipSync(bytes, { level: 9 });
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(cached, gz);
  return gz;
}

export async function prepareOcrAssets(targetDir, { models = ['fast', 'best_int'], log = console.log } = {}) {
  mkdirSync(join(targetDir, 'core'), { recursive: true });
  copyFileSync(join(projectRoot, 'node_modules', 'tesseract.js', 'dist', 'worker.min.js'), join(targetDir, 'worker.min.js'));
  for (const f of CORE_FILES) {
    copyFileSync(join(projectRoot, 'node_modules', 'tesseract.js-core', f), join(targetDir, 'core', f));
  }
  for (const id of models) {
    const gz = await loadModel(id, log);
    const dir = join(targetDir, 'models', id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'eng.traineddata.gz'), gz);
  }
  log(`OCR assets ready in ${targetDir} (models: ${models.join(', ')})`);
}

/**
 * Vite plugin: prepares OCR assets in public/ocr before the build so they are
 * deployed next to the app. Fails the production build if assets can't be
 * prepared (never ship a broken lab); only warns in dev.
 */
export function ocrAssetsPlugin({ models = ['fast', 'best_int'] } = {}) {
  let isBuild = false;
  return {
    name: 'quotekeeper-ocr-assets',
    configResolved(config) {
      isBuild = config.command === 'build';
    },
    async buildStart() {
      try {
        await prepareOcrAssets(join(projectRoot, 'public', 'ocr'), { models, log: (m) => (typeof this.info === 'function' ? this.info(m) : console.log(m)) });
      } catch (err) {
        if (isBuild) throw err;
        this.warn(`OCR assets unavailable (OCR Lab will not work in dev): ${err.message}`);
      }
    },
  };
}

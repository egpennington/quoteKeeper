// On-device OCR engine wrapper (Tesseract.js 7, self-hosted assets).
// Images never leave the browser; worker, engine, and models are served from
// this app's own origin under /ocr/ (prepared at build time by scripts/ocr-assets.mjs).
//
// Coordinate contract: OCR runs on a downscaled copy of the photo, and every
// returned box is mapped back to ORIGINAL photo pixels (EXIF-oriented).

import { createWorker } from 'tesseract.js';
import { rotatedSize, rotationMatrix } from '../workspace/viewport';

export const OCR_MODELS = {
  best_int: { label: 'best_int', description: 'Tesseract.js default · ~2.9 MB' },
  fast: { label: 'fast', description: 'Fastest · ~2.0 MB' },
};
export const OCR_SIZES = [1600, 2000, 2500];
export const DEFAULT_OCR = { model: 'best_int', size: 2000 };

const assetBase = () => new URL(`${import.meta.env.BASE_URL}ocr/`, window.location.href).href;

// Same SIMD probe Tesseract.js uses to pick its engine build (reported for diagnostics).
const SIMD_PROBE = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);
export function wasmSimdSupported() {
  try {
    return WebAssembly.validate(SIMD_PROBE);
  } catch {
    return false;
  }
}

/**
 * Creates a worker for one model. `cache: false` re-fetches the model each time
 * (cold-load measurement); the browser's HTTP cache may still serve it.
 */
export async function createOcrWorker(model, { cache = false, onProgress } = {}) {
  if (!OCR_MODELS[model]) throw new Error(`Unknown OCR model: ${model}`);
  const base = assetBase();
  const t0 = performance.now();
  const worker = await createWorker('eng', 1 /* LSTM only */, {
    workerPath: `${base}worker.min.js`,
    corePath: `${base}core`, // directory, so Tesseract picks the SIMD / non-SIMD build
    langPath: `${base}models/${model}`,
    gzip: true,
    cacheMethod: cache ? 'write' : 'none',
    logger: onProgress ? (m) => onProgress(m) : undefined,
  });
  return { worker, loadMs: performance.now() - t0 };
}

/** Decodes a photo once at full resolution with EXIF orientation applied. */
export function decodePhoto(file) {
  return createImageBitmap(file, { imageOrientation: 'from-image' });
}

/**
 * Downscales (never upscales) to `size` px on the long edge and encodes PNG for OCR.
 * `rotation` (0/90/180/270, clockwise) turns the page first; returned boxes are
 * then in rotated "page" pixels (see workspace/viewport.js).
 */
export async function prepareOcrInput(bitmap, size, rotation = 0) {
  const t0 = performance.now();
  const page = rotatedSize(bitmap.width, bitmap.height, rotation);
  const scale = Math.min(1, size / Math.max(page.width, page.height));
  const width = Math.round(page.width * scale);
  const height = Math.round(page.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const [a, b, c, d, e, f] = rotationMatrix(rotation, bitmap.width, bitmap.height);
  const sx = width / page.width;
  const sy = height / page.height;
  ctx.setTransform(a * sx, b * sy, c * sx, d * sy, e * sx, f * sy);
  ctx.drawImage(bitmap, 0, 0);
  const blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode OCR input'))), 'image/png'),
  );
  canvas.width = canvas.height = 0; // release pixels early
  return {
    blob,
    width,
    height,
    scaleX: page.width / width,
    scaleY: page.height / height,
    prepMs: performance.now() - t0,
  };
}

/**
 * Runs OCR and returns words/lines with boxes in ORIGINAL photo pixels.
 * Word: { id, text, confidence, bbox:{x0,y0,x1,y1}, line, paragraph, block }
 */
export async function recognizePhoto(worker, input) {
  const t0 = performance.now();
  const { data } = await worker.recognize(input.blob, {}, { text: true, blocks: true });
  const recognizeMs = performance.now() - t0;

  const map = (b) => ({ x0: b.x0 * input.scaleX, y0: b.y0 * input.scaleY, x1: b.x1 * input.scaleX, y1: b.y1 * input.scaleY });
  const words = [];
  let lineIndex = 0;
  let paragraphIndex = 0;
  (data.blocks || []).forEach((block, blockIndex) => {
    for (const paragraph of block.paragraphs) {
      for (const line of paragraph.lines) {
        for (const w of line.words) {
          words.push({
            id: words.length,
            text: w.text,
            confidence: w.confidence,
            bbox: map(w.bbox),
            line: lineIndex,
            paragraph: paragraphIndex,
            block: blockIndex,
          });
        }
        lineIndex++;
      }
      paragraphIndex++;
    }
  });

  const meanConfidence = words.length ? words.reduce((a, w) => a + w.confidence, 0) / words.length : 0;
  return { text: data.text || '', words, lines: lineIndex, recognizeMs, meanConfidence };
}

/** Finds the word whose box contains (x, y) in original-photo pixels. */
export function wordAt(words, x, y) {
  return words.find((w) => x >= w.bbox.x0 && x <= w.bbox.x1 && y >= w.bbox.y0 && y <= w.bbox.y1) || null;
}

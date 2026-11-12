// On-device OCR engine wrapper (Tesseract.js 7, self-hosted assets).
// Images never leave the browser; worker, engine, and models are served from
// this app's own origin under /ocr/ (prepared at build time by scripts/ocr-assets.mjs).
//
// Coordinate contract: OCR runs on a downscaled copy of the photo, and every
// returned box is mapped back to ORIGINAL photo pixels (EXIF-oriented).

import { createWorker } from 'tesseract.js';
import { rotatedSize, rotationMatrix } from '../workspace/viewport';

// Chosen by the Sprint 2A-0 benchmark (benchmark/ocr): the best_int model
// (~2.9 MB, Tesseract.js default) at 2000 px on the long edge. The models listed
// here must match the ones vite.config.js asks scripts/ocr-assets.mjs to prepare.
export const OCR_MODELS = ['best_int'];
export const DEFAULT_OCR = { model: 'best_int', size: 2000 };

const assetBase = () => new URL(`${import.meta.env.BASE_URL}ocr/`, window.location.href).href;

/**
 * Creates a worker for one model. `cache: false` re-fetches the model each time
 * (cold-load measurement); the browser's HTTP cache may still serve it.
 */
export async function createOcrWorker(model, { cache = false, onProgress } = {}) {
  if (!OCR_MODELS.includes(model)) throw new Error(`Unknown OCR model: ${model}`);
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

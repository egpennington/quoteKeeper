// SmartScan reading order and passage text (pure functions, no browser APIs).
//
// Input: words from ocrEngine.recognizePhoto(), in page pixels:
//   { text, confidence, bbox:{x0,y0,x1,y1}, line, paragraph, block }
// Tesseract emits these block -> paragraph -> line -> word. Its layout analysis
// already handles columns, and its lines follow curved baselines on bound book
// pages, so we keep its line grouping and block order rather than re-clustering
// words by y-position (which breaks on curved or tilted pages).
//
// What this module adds:
//   - drops empty tokens and specks of noise,
//   - guarantees left-to-right order inside each line,
//   - assigns `index` (position in reading order) and a dense `line` number,
//   - joins a selected range back into prose (line-break hyphens healed).

const ALNUM = /[\p{L}\p{N}]/u;

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** True for OCR output that is almost certainly a speck, not text. */
function isNoise(word, medianHeight) {
  const text = word.text.trim();
  if (!text) return true;
  const h = word.bbox.y1 - word.bbox.y0;
  const w = word.bbox.x1 - word.bbox.x0;
  if (w <= 0 || h <= 0) return true;
  // A lone symbol with very low confidence is usually dirt or a page edge.
  if (text.length === 1 && !ALNUM.test(text) && word.confidence < 25) return true;
  // Far shorter than normal text (e.g. a dust mark under a line).
  if (medianHeight > 0 && h < medianHeight * 0.25) return true;
  return false;
}

/**
 * Returns words in reading order: [{ ...word, text (trimmed), index, line }]
 * `line` is renumbered 0..n-1 so consecutive lines differ by exactly one.
 */
export function buildReadingOrder(rawWords) {
  const candidates = rawWords.filter((w) => w && typeof w.text === 'string' && w.text.trim());
  const medianHeight = median(candidates.map((w) => w.bbox.y1 - w.bbox.y0));

  // Group by Tesseract line, keeping first-seen line order.
  const lines = new Map();
  for (const word of candidates) {
    if (isNoise(word, medianHeight)) continue;
    const key = `${word.block ?? 0}:${word.line}`;
    if (!lines.has(key)) lines.set(key, []);
    lines.get(key).push(word);
  }

  const ordered = [];
  let lineNo = 0;
  for (const lineWords of lines.values()) {
    lineWords.sort((a, b) => a.bbox.x0 - b.bbox.x0);
    for (const word of lineWords) {
      ordered.push({ ...word, text: word.text.trim(), index: ordered.length, line: lineNo });
    }
    lineNo++;
  }
  return ordered;
}

// Hyphen, Unicode hyphen, non-breaking hyphen, soft hyphen.
const LINE_END_HYPHEN = /\p{L}[-‐‑­]$/u;
// Lone straight quotes (" ') are ambiguous, so they keep normal spacing.
const CLOSING_ONLY = /^[.,;:!?)\]}”’…]+$/u;
const OPENING_ONLY = /^[([{“‘]$/u;

/**
 * Joins words[start..end] (inclusive, either order) into a single line of prose.
 * A word broken across lines with a hyphen ("remem-" / "bering") is rejoined.
 * Hyphens inside a word on one line ("well-known") are kept.
 */
export function joinWords(words, start, end) {
  if (!words.length || start == null || end == null) return '';
  const lo = Math.max(0, Math.min(start, end));
  const hi = Math.min(words.length - 1, Math.max(start, end));

  let out = '';
  for (let i = lo; i <= hi; i++) {
    const curr = words[i];
    if (i === lo) {
      out = curr.text;
      continue;
    }
    const prev = words[i - 1];
    const newLine = curr.line !== prev.line;

    if (newLine && LINE_END_HYPHEN.test(prev.text) && /^\p{Ll}/u.test(curr.text)) {
      out = out.slice(0, -1) + curr.text; // "remem-" + "bering": drop the hyphen
    } else if (newLine && LINE_END_HYPHEN.test(prev.text) && /^\p{Lu}/u.test(curr.text)) {
      out += curr.text; // "Anglo-" + "Saxon": a real compound, keep the hyphen
    } else if (CLOSING_ONLY.test(curr.text) || OPENING_ONLY.test(prev.text)) {
      out += curr.text;
    } else {
      out += ` ${curr.text}`;
    }
  }
  return out.replace(/\s+/g, ' ').trim();
}

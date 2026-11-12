// Accuracy and bounding-box metrics for the OCR benchmark. Pure functions.

/** Normalizes typography so curly quotes, dashes, and spacing don't count as OCR errors. */
export function normalizeText(s) {
  return (s || '')
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/­/g, '') // soft hyphen
    .replace(/-\s*\n\s*/g, '') // join words hyphenated across lines
    .replace(/\s+/g, ' ')
    .trim();
}

/** Word form used for matching individual words: lowercase, letters/digits only. */
export const wordKey = (w) => (w || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Semi-global edit distance: the whole of `ref` must be matched, but it may sit
 * anywhere inside `hyp` (free leading/trailing hyp). Lets users supply ground
 * truth for just the underlined passage while OCR returns the whole page.
 */
function semiGlobalDistance(ref, hyp, eq) {
  const n = ref.length;
  const m = hyp.length;
  let prev = new Int32Array(m + 1); // row 0 = 0: free start in hyp
  let cur = new Int32Array(m + 1);
  for (let i = 1; i <= n; i++) {
    cur[0] = i;
    const r = ref[i - 1];
    for (let j = 1; j <= m; j++) {
      const sub = prev[j - 1] + (eq(r, hyp[j - 1]) ? 0 : 1);
      const del = prev[j] + 1;
      const ins = cur[j - 1] + 1;
      cur[j] = sub < del ? (sub < ins ? sub : ins) : del < ins ? del : ins;
    }
    [prev, cur] = [cur, prev];
  }
  let best = Infinity;
  for (let j = 0; j <= m; j++) if (prev[j] < best) best = prev[j]; // free end
  return best;
}

/** Character and word error rates of OCR text against (possibly partial) ground truth. */
export function errorRates(groundTruth, ocrText) {
  const ref = normalizeText(groundTruth);
  const hyp = normalizeText(ocrText);
  if (!ref) return null;

  const cer = semiGlobalDistance(ref, hyp, (a, b) => a === b) / ref.length;

  const refWords = ref.split(' ').map(wordKey).filter(Boolean);
  const hypWords = hyp.split(' ').map(wordKey).filter(Boolean);
  const wer = refWords.length ? semiGlobalDistance(refWords, hypWords, (a, b) => a === b) / refWords.length : 0;

  return { cer, wer, refChars: ref.length, refWords: refWords.length };
}

const area = (b) => Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0);

export function iou(a, b) {
  const inter = area({
    x0: Math.max(a.x0, b.x0),
    y0: Math.max(a.y0, b.y0),
    x1: Math.min(a.x1, b.x1),
    y1: Math.min(a.y1, b.y1),
  });
  const union = area(a) + area(b) - inter;
  return union > 0 ? inter / union : 0;
}

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/**
 * Compares OCR word boxes (already mapped to original-image pixels) with
 * ground-truth word boxes from a synthetic page.
 *  - boxHit:    an OCR box overlaps the GT word with IoU >= 0.5
 *  - centerHit: the GT word's center falls inside the best OCR box (what a tap needs)
 *  - textHit:   that OCR word's text also matches
 *  - dx/dy:     median center offset in px — a systematic offset signals a mapping bug
 */
export function boxMetrics(gtWords, ocrWords) {
  let boxHits = 0;
  let centerHits = 0;
  let textHits = 0;
  const ious = [];
  const dxs = [];
  const dys = [];

  for (const gt of gtWords) {
    let best = null;
    let bestIou = 0;
    for (const w of ocrWords) {
      // cheap reject before IoU
      if (w.bbox.x1 < gt.bbox.x0 || w.bbox.x0 > gt.bbox.x1 || w.bbox.y1 < gt.bbox.y0 || w.bbox.y0 > gt.bbox.y1) continue;
      const v = iou(gt.bbox, w.bbox);
      if (v > bestIou) {
        bestIou = v;
        best = w;
      }
    }
    if (!best) continue;

    const cx = (gt.bbox.x0 + gt.bbox.x1) / 2;
    const cy = (gt.bbox.y0 + gt.bbox.y1) / 2;
    if (cx >= best.bbox.x0 && cx <= best.bbox.x1 && cy >= best.bbox.y0 && cy <= best.bbox.y1) centerHits++;

    if (bestIou >= 0.5) {
      boxHits++;
      ious.push(bestIou);
      dxs.push((best.bbox.x0 + best.bbox.x1) / 2 - cx);
      dys.push((best.bbox.y0 + best.bbox.y1) / 2 - cy);
      if (wordKey(best.text) === wordKey(gt.text)) textHits++;
    }
  }

  const n = gtWords.length || 1;
  return {
    gtWords: gtWords.length,
    boxHitRate: boxHits / n,
    centerHitRate: centerHits / n,
    textHitRate: textHits / n,
    medianIou: median(ious),
    medianDx: median(dxs),
    medianDy: median(dys),
  };
}

// SmartScan two-tap passage selection (pure functions, no browser APIs).
//
// Selection state: { anchor, start, end }, all word indices in reading order.
//   idle      anchor=null, start=null            nothing selected
//   anchored  anchor=i,    start=null            first word tapped, waiting for the last
//   selected  anchor=null, start<=end            passage chosen
//
// Tap 1 sets the anchor. Tap 2 completes the range in either direction (tapping
// the anchor again selects that single word). Any tap on a completed selection
// starts a new one, so the user never has to clear first.

export const EMPTY_SELECTION = Object.freeze({ anchor: null, start: null, end: null });

export function selectionPhase(sel) {
  if (sel.anchor != null) return 'anchored';
  if (sel.start != null) return 'selected';
  return 'idle';
}

export function tapWord(sel, index) {
  if (index == null) return sel;
  if (sel.anchor != null) {
    return { anchor: null, start: Math.min(sel.anchor, index), end: Math.max(sel.anchor, index) };
  }
  return { anchor: index, start: null, end: null };
}

/** The highlighted index range, inclusive: the anchor alone while waiting for tap 2. */
export function highlightedRange(sel) {
  if (sel.anchor != null) return { start: sel.anchor, end: sel.anchor };
  if (sel.start != null) return { start: sel.start, end: sel.end };
  return null;
}

/**
 * Finds the word under (x, y) in page pixels.
 * `tolerance` is the finger allowance in page pixels; callers convert from
 * screen pixels (tolerance = 22 / viewScale) so it feels the same at any zoom.
 * The closest box wins (distance 0 inside a box); vertical distance is weighted
 * higher so a tap between lines goes to the closer line. Returns an index, or
 * null if nothing is within the tolerance.
 */
export function hitTest(words, x, y, tolerance = 0) {
  let best = null;
  let bestDist = Infinity;
  for (let i = 0; i < words.length; i++) {
    const b = words[i].bbox;
    const dx = Math.max(b.x0 - x, 0, x - b.x1);
    const dy = Math.max(b.y0 - y, 0, y - b.y1);
    const dist = Math.hypot(dx, dy * 1.4);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
      if (dist === 0) break;
    }
  }
  return bestDist <= tolerance ? best : null;
}

/**
 * One highlight rectangle per line for words[start..end], in page pixels,
 * like phone text selection: [{ line, x0, y0, x1, y1 }].
 */
export function selectionRects(words, start, end) {
  if (start == null || end == null || !words.length) return [];
  const lo = Math.max(0, Math.min(start, end));
  const hi = Math.min(words.length - 1, Math.max(start, end));
  const rects = [];
  for (let i = lo; i <= hi; i++) {
    const { line, bbox } = words[i];
    const last = rects[rects.length - 1];
    if (last && last.line === line) {
      last.x0 = Math.min(last.x0, bbox.x0);
      last.y0 = Math.min(last.y0, bbox.y0);
      last.x1 = Math.max(last.x1, bbox.x1);
      last.y1 = Math.max(last.y1, bbox.y1);
    } else {
      rects.push({ line, x0: bbox.x0, y0: bbox.y0, x1: bbox.x1, y1: bbox.y1 });
    }
  }
  return rects;
}

/** Bounding box of a set of rects, or null. */
export function unionRect(rects) {
  if (!rects.length) return null;
  return rects.reduce(
    (u, r) => ({ x0: Math.min(u.x0, r.x0), y0: Math.min(u.y0, r.y0), x1: Math.max(u.x1, r.x1), y1: Math.max(u.y1, r.y1) }),
    { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity },
  );
}

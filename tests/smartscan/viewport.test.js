import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildReadingOrder } from '../../src/components/smartscan/selection/readingOrder.js';
import { hitTest } from '../../src/components/smartscan/selection/selection.js';
import {
  ROTATIONS,
  applyMatrix,
  clampView,
  fitView,
  nextRotation,
  pageToScreen,
  pinchStep,
  revealRect,
  rotatedSize,
  rotationMatrix,
  scaleLimits,
  screenToPage,
  zoomAt,
} from '../../src/components/smartscan/workspace/viewport.js';
import { PAGE, centerOf, makeWords } from '../fixtures/ocrPage.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);
const VIEW = { w: 390, h: 700 }; // phone portrait viewport, CSS px
const PHOTO = { w: 3000, h: 4000 }; // 12 MP portrait photo

describe('rotation', () => {
  it('cycles 0 → 90 → 180 → 270 → 0', () => {
    assert.deepEqual([0, 90, 180, 270].map(nextRotation), [90, 180, 270, 0]);
  });

  it('swaps page dimensions for quarter turns', () => {
    assert.deepEqual(rotatedSize(3000, 4000, 90), { width: 4000, height: 3000 });
    assert.deepEqual(rotatedSize(3000, 4000, 180), { width: 3000, height: 4000 });
  });

  for (const r of ROTATIONS) {
    it(`maps the photo exactly onto the page at ${r}° (no shift, no scaling)`, () => {
      const m = rotationMatrix(r, PHOTO.w, PHOTO.h);
      const page = rotatedSize(PHOTO.w, PHOTO.h, r);
      const corners = [
        [0, 0],
        [PHOTO.w, 0],
        [0, PHOTO.h],
        [PHOTO.w, PHOTO.h],
      ].map(([x, y]) => applyMatrix(m, x, y));
      const xs = corners.map((p) => p.x).sort((a, b) => a - b);
      const ys = corners.map((p) => p.y).sort((a, b) => a - b);
      assert.deepEqual([xs[0], xs[3], ys[0], ys[3]], [0, page.width, 0, page.height]);
    });
  }

  it('turns clockwise: the photo’s top-left lands top-right after 90°', () => {
    assert.deepEqual(applyMatrix(rotationMatrix(90, PHOTO.w, PHOTO.h), 0, 0), { x: PHOTO.h, y: 0 });
  });
});

describe('view transform', () => {
  it('fits and centres the whole page', () => {
    const v = fitView(VIEW.w, VIEW.h, PHOTO.w, PHOTO.h);
    close(v.scale, 390 / 3000);
    close(v.tx, 0);
    close(v.ty, (700 - 4000 * v.scale) / 2);
  });

  it('screen ↔ page round-trips at any zoom', () => {
    for (const scale of [0.13, 0.5, 1, 1.5]) {
      const v = { scale, tx: -123.4, ty: 56.7 };
      const s = pageToScreen(v, 1234, 2345);
      const p = screenToPage(v, s.x, s.y);
      close(p.x, 1234, 1e-6);
      close(p.y, 2345, 1e-6);
    }
  });

  it('pinch/wheel zoom keeps the page point under the fingers fixed', () => {
    const v = fitView(VIEW.w, VIEW.h, PHOTO.w, PHOTO.h);
    const focus = { x: 200, y: 333 };
    const before = screenToPage(v, focus.x, focus.y);
    const after = screenToPage(zoomAt(v, v.scale * 3.7, focus.x, focus.y), focus.x, focus.y);
    close(after.x, before.x, 1e-6);
    close(after.y, before.y, 1e-6);
  });

  it('a two-finger pinch keeps the page point between the fingers, even with one-finger-at-a-time events', () => {
    // Fingers start 80 px apart around (200, 300) and spread to 260 px while
    // drifting right; each finger reports separately, as Chrome does.
    let v = fitView(VIEW.w, VIEW.h, PHOTO.w, PHOTO.h);
    const target = screenToPage(v, 200, 300);
    let f1 = { x: 160, y: 300 };
    let f2 = { x: 240, y: 300 };
    const metrics = () => ({ x: (f1.x + f2.x) / 2, y: (f1.y + f2.y) / 2, dist: Math.hypot(f2.x - f1.x, f2.y - f1.y) });
    let prev = metrics();
    for (let i = 1; i <= 10; i++) {
      for (const move of [() => (f1 = { x: 160 - 9 * i + 3 * i, y: 300 }), () => (f2 = { x: 240 + 9 * i + 3 * i, y: 300 })]) {
        move();
        const next = metrics();
        v = pinchStep(v, prev, next);
        prev = next;
      }
    }
    const now = screenToPage(v, prev.x, prev.y);
    close(now.x, target.x, 1e-6);
    close(now.y, target.y, 1e-6);
    close(v.scale / fitView(VIEW.w, VIEW.h, PHOTO.w, PHOTO.h).scale, 260 / 80, 1e-9);
  });

  it('pinching from whole-page (page shorter than the screen) keeps the word under the fingers', () => {
    // Regression: clamping every frame re-centred the short page vertically and
    // the word drifted ~150 px. The workspace clamps the start→now result instead.
    const start = fitView(VIEW.w, VIEW.h, PHOTO.w, PHOTO.h);
    assert.ok(PHOTO.h * start.scale < VIEW.h); // page shorter than the viewport
    const from = { x: 230, y: 240, dist: 80 };
    const target = screenToPage(start, from.x, from.y);
    for (const dist of [100, 140, 200, 260]) {
      const v = clampView(pinchStep(start, from, { ...from, dist }), VIEW.w, VIEW.h, PHOTO.w, PHOTO.h);
      if (PHOTO.h * v.scale <= VIEW.h) continue; // still shorter: centred by design
      const now = screenToPage(v, from.x, from.y);
      close(now.x, target.x, 1e-6);
      close(now.y, target.y, 1e-6);
    }
  });

  it('clamps zoom between whole-page and the maximum', () => {
    const { min, max } = scaleLimits(VIEW.w, VIEW.h, PHOTO.w, PHOTO.h);
    assert.ok(max >= 1.5);
    assert.equal(clampView({ scale: min / 4, tx: 0, ty: 0 }, VIEW.w, VIEW.h, PHOTO.w, PHOTO.h).scale, min);
    assert.equal(clampView({ scale: max * 4, tx: 0, ty: 0 }, VIEW.w, VIEW.h, PHOTO.w, PHOTO.h).scale, max);
  });

  it('never pans the page away from the viewport edges when zoomed in', () => {
    const v = clampView({ scale: 1, tx: 500, ty: -99999 }, VIEW.w, VIEW.h, PHOTO.w, PHOTO.h);
    assert.equal(v.tx, 0);
    assert.equal(v.ty, VIEW.h - PHOTO.h);
  });

  it('lets a tall page be dragged past its bottom edge by the padding (to clear floating controls), not the top', () => {
    const pad = { bottom: 64 };
    const down = clampView({ scale: 1, tx: 0, ty: -99999 }, VIEW.w, VIEW.h, PHOTO.w, PHOTO.h, pad);
    assert.equal(down.ty, VIEW.h - PHOTO.h - 64);
    const up = clampView({ scale: 1, tx: 0, ty: 500 }, VIEW.w, VIEW.h, PHOTO.w, PHOTO.h, pad);
    assert.equal(up.ty, 0);
    // A page that fits is still centred; the padding doesn't shift it.
    const fit = fitView(VIEW.w, VIEW.h, PHOTO.w, PHOTO.h);
    assert.deepEqual(clampView(fit, VIEW.w, VIEW.h, PHOTO.w, PHOTO.h, pad), fit);
  });

  it('reveals an off-screen selection with the minimum pan, and leaves a visible one alone', () => {
    const v = { scale: 1, tx: 0, ty: 0 };
    const below = { x0: 100, y0: 1000, x1: 300, y1: 1060 };
    const moved = revealRect(v, below, VIEW.w, VIEW.h, 16);
    const bottom = pageToScreen(moved, below.x1, below.y1);
    close(bottom.y, VIEW.h - 16);
    assert.equal(moved.tx, 0);
    const visible = { x0: 50, y0: 50, x1: 200, y1: 90 };
    assert.deepEqual(revealRect(v, visible, VIEW.w, VIEW.h, 16), v);
  });

  it('does not jump sideways for a passage wider than the screen that is already partly visible', () => {
    const v = { scale: 1, tx: -1500, ty: 0 }; // zoomed in on the right half of a line
    const wide = { x0: 200, y0: 100, x1: 2800, y1: 200 }; // full text width
    assert.equal(revealRect(v, wide, VIEW.w, VIEW.h, 16).tx, v.tx);
    const offLeft = { x0: 200, y0: 100, x1: 1400, y1: 200 }; // wider than screen, entirely left of it
    const moved = revealRect(v, offLeft, VIEW.w, VIEW.h, 16);
    close(pageToScreen(moved, offLeft.x1, 0).x, 16);
  });
});

describe('overlay alignment end to end', () => {
  // Word boxes are scaled up from a page photographed at 3000x4000 (×6 the fixture).
  const words = buildReadingOrder(makeWords(PAGE)).map((w) => ({
    ...w,
    bbox: { x0: w.bbox.x0 * 6, y0: w.bbox.y0 * 6, x1: w.bbox.x1 * 6, y1: w.bbox.y1 * 6 },
  }));

  it('a tap on the on-screen centre of every word selects that word, at fit and zoomed', () => {
    const fit = fitView(VIEW.w, VIEW.h, PHOTO.w, PHOTO.h);
    const views = [fit, zoomAt(fit, fit.scale * 4, 100, 400), zoomAt(fit, fit.scale * 9, 300, 150)];
    for (const v of views) {
      for (const w of words) {
        const c = centerOf(w);
        const s = pageToScreen(v, c.x, c.y);
        const p = screenToPage(v, s.x, s.y);
        assert.equal(hitTest(words, p.x, p.y, 22 / v.scale), w.index, `word ${w.text} at scale ${v.scale}`);
      }
    }
  });

  it('the finger allowance is constant on screen: 22 px at any zoom', () => {
    const fox = words.find((w) => w.text === 'fox');
    const fit = fitView(VIEW.w, VIEW.h, PHOTO.w, PHOTO.h);
    for (const v of [fit, zoomAt(fit, fit.scale * 5, 0, 0)]) {
      const right = pageToScreen(v, fox.bbox.x1, centerOf(fox).y);
      const inside = screenToPage(v, right.x + 20, right.y); // 20 screen px right of "fox"
      const outside = screenToPage(v, right.x + 200, right.y);
      const hitInside = hitTest(words, inside.x, inside.y, 22 / v.scale);
      assert.ok(hitInside === fox.index || words[hitInside].text === 'jumps');
      if (v.scale > fit.scale) assert.notEqual(hitTest(words, outside.x, outside.y, 22 / v.scale), fox.index);
    }
  });
});

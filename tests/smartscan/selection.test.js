import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildReadingOrder, joinWords } from '../../src/components/smartscan/selection/readingOrder.js';
import {
  EMPTY_SELECTION,
  highlightedRange,
  hitTest,
  selectionPhase,
  selectionRects,
  tapWord,
  unionRect,
} from '../../src/components/smartscan/selection/selection.js';
import { PAGE, centerOf, makeWords } from '../fixtures/ocrPage.js';

const words = buildReadingOrder(makeWords(PAGE));
const at = (text) => words.findIndex((w) => w.text === text);
const tapText = (sel, text) => tapWord(sel, hitTest(words, centerOf(words[at(text)]).x, centerOf(words[at(text)]).y));

describe('two-tap selection state', () => {
  it('first tap anchors, second tap completes the range', () => {
    let sel = tapWord(EMPTY_SELECTION, 2);
    assert.equal(selectionPhase(sel), 'anchored');
    assert.deepEqual(highlightedRange(sel), { start: 2, end: 2 });
    sel = tapWord(sel, 5);
    assert.equal(selectionPhase(sel), 'selected');
    assert.deepEqual(highlightedRange(sel), { start: 2, end: 5 });
  });

  it('accepts a reverse-direction selection (last word tapped first)', () => {
    const sel = tapWord(tapWord(EMPTY_SELECTION, 9), 3);
    assert.deepEqual(highlightedRange(sel), { start: 3, end: 9 });
  });

  it('tapping the anchor again selects that single word', () => {
    const sel = tapWord(tapWord(EMPTY_SELECTION, 4), 4);
    assert.deepEqual(highlightedRange(sel), { start: 4, end: 4 });
    assert.equal(selectionPhase(sel), 'selected');
  });

  it('a tap after a completed selection starts a new one immediately', () => {
    const sel = tapWord(tapWord(tapWord(EMPTY_SELECTION, 1), 3), 8);
    assert.equal(selectionPhase(sel), 'anchored');
    assert.deepEqual(highlightedRange(sel), { start: 8, end: 8 });
  });

  it('ignores a tap that hit no word', () => {
    const anchored = tapWord(EMPTY_SELECTION, 2);
    assert.equal(tapWord(anchored, null), anchored);
  });
});

describe('selecting by tapping word positions', () => {
  it('selects words on a single line', () => {
    const sel = tapText(tapText(EMPTY_SELECTION, 'quick'), 'fox');
    assert.equal(joinWords(words, sel.start, sel.end), 'quick brown fox');
  });

  it('selects a passage spanning three lines in reading order', () => {
    const sel = tapText(tapText(EMPTY_SELECTION, 'lazy'), 'bering');
    assert.equal(joinWords(words, sel.start, sel.end), 'lazy dog while the patient reader keeps remembering');
    assert.equal(selectionRects(words, sel.start, sel.end).length, 3);
  });

  it('reverse taps across lines give the same passage', () => {
    const fwd = tapText(tapText(EMPTY_SELECTION, 'lazy'), 'bering');
    const rev = tapText(tapText(EMPTY_SELECTION, 'bering'), 'lazy');
    assert.deepEqual(highlightedRange(rev), highlightedRange(fwd));
  });
});

describe('hitTest', () => {
  const fox = words[at('fox')];

  it('hits the word under the point', () => {
    const c = centerOf(fox);
    assert.equal(hitTest(words, c.x, c.y), at('fox'));
  });

  it('misses empty margin when there is no tolerance', () => {
    assert.equal(hitTest(words, 5, 5), null);
  });

  it('snaps a near miss to the nearest word within the finger tolerance', () => {
    // 6 px right of "jumps" (the last word on line 1).
    const jumps = words[at('jumps')];
    assert.equal(hitTest(words, jumps.bbox.x1 + 6, centerOf(jumps).y, 0), null);
    assert.equal(hitTest(words, jumps.bbox.x1 + 6, centerOf(jumps).y, 10), at('jumps'));
  });

  it('a tap between two lines goes to the closer line', () => {
    const top = words[at('fox')];
    // Lines are 20 px tall with a 10 px gap: 3 px below line 1 vs 7 px above line 2.
    assert.equal(words[hitTest(words, centerOf(top).x, top.bbox.y1 + 3, 12)].line, top.line);
    assert.equal(words[hitTest(words, centerOf(top).x, top.bbox.y1 + 7, 12)].line, top.line + 1);
  });
});

describe('selectionRects', () => {
  it('produces one rect per line covering the selected words', () => {
    const start = at('brown');
    const end = at('lazy');
    const rects = selectionRects(words, start, end);
    assert.equal(rects.length, 2);
    assert.equal(rects[0].x0, words[start].bbox.x0);
    assert.equal(rects[0].x1, words[at('jumps')].bbox.x1);
    assert.equal(rects[1].x0, words[at('over')].bbox.x0);
    assert.equal(rects[1].x1, words[end].bbox.x1);
  });

  it('is the same for reversed arguments and unions to the full extent', () => {
    assert.deepEqual(selectionRects(words, 12, 3), selectionRects(words, 3, 12));
    const u = unionRect(selectionRects(words, 0, words.length - 1));
    assert.equal(u.y0, words[0].bbox.y0);
    assert.equal(u.y1, words[words.length - 1].bbox.y1);
  });
});

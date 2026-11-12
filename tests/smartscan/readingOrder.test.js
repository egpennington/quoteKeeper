import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildReadingOrder, joinWords } from '../../src/components/smartscan/selection/readingOrder.js';
import { PAGE, makeWords } from '../fixtures/ocrPage.js';

const texts = (words) => words.map((w) => w.text);
const indexOf = (words, text, from = 0) => words.findIndex((w, i) => i >= from && w.text === text);

describe('reading order', () => {
  it('keeps line order and assigns sequential indices and dense line numbers', () => {
    const words = buildReadingOrder(makeWords(PAGE));
    assert.deepEqual(texts(words).slice(0, 7), ['The', 'quick', 'brown', 'fox', 'jumps', 'over', 'the']);
    words.forEach((w, i) => assert.equal(w.index, i));
    assert.deepEqual([...new Set(words.map((w) => w.line))], [0, 1, 2, 3]);
  });

  it('sorts words left to right within a line even if the engine emits them out of order', () => {
    const raw = makeWords([{ lines: ['alpha beta gamma'] }]);
    const words = buildReadingOrder([raw[2], raw[0], raw[1]]);
    assert.deepEqual(texts(words), ['alpha', 'beta', 'gamma']);
  });

  it('reads a whole column (block) before the next one, not across the gutter', () => {
    const raw = makeWords([
      { x: 50, y: 50, lines: ['left one', 'left two'] },
      { x: 600, y: 50, lines: ['right one', 'right two'] },
    ]);
    assert.deepEqual(texts(buildReadingOrder(raw)), ['left', 'one', 'left', 'two', 'right', 'one', 'right', 'two']);
  });

  it('drops empty tokens, low-confidence specks, and marks far shorter than the text', () => {
    const raw = makeWords([{ lines: ['real words here ok'] }]);
    raw.push({ ...raw[0], text: '   ', id: 90 });
    raw.push({ ...raw[0], text: '~', confidence: 10, id: 91, bbox: { x0: 400, y0: 50, x1: 410, y1: 70 } });
    raw.push({ ...raw[0], text: 'dust', id: 92, bbox: { x0: 500, y0: 50, x1: 540, y1: 53 } });
    assert.deepEqual(texts(buildReadingOrder(raw)), ['real', 'words', 'here', 'ok']);
  });

  it('keeps confident punctuation such as a dash', () => {
    const raw = makeWords([{ lines: ['wait — then go'] }]);
    assert.deepEqual(texts(buildReadingOrder(raw)), ['wait', '—', 'then', 'go']);
  });
});

describe('joinWords', () => {
  const words = buildReadingOrder(makeWords(PAGE));

  it('joins a single-line range', () => {
    assert.equal(joinWords(words, 1, 3), 'quick brown fox');
  });

  it('joins across multiple lines with single spaces', () => {
    const start = indexOf(words, 'jumps');
    const end = indexOf(words, 'dog');
    assert.equal(joinWords(words, start, end), 'jumps over the lazy dog');
  });

  it('gives the same text for a reversed range', () => {
    assert.equal(joinWords(words, 7, 2), joinWords(words, 2, 7));
  });

  it('heals a word hyphenated across a line break', () => {
    const start = indexOf(words, 'keeps');
    const end = indexOf(words, 'every');
    assert.equal(joinWords(words, start, end), 'keeps remembering every');
  });

  it('keeps a hyphen inside a word on one line', () => {
    const start = indexOf(words, 'every');
    assert.equal(joinWords(words, start, words.length - 1), 'every well-known word.');
  });

  it('keeps the hyphen when the next line starts with a capital (e.g. a proper name)', () => {
    const w = buildReadingOrder(makeWords([{ lines: ['the Anglo-', 'Saxon kings'] }]));
    assert.equal(joinWords(w, 0, w.length - 1), 'the Anglo-Saxon kings');
  });

  it('heals soft and Unicode hyphens too', () => {
    const w = buildReadingOrder(makeWords([{ lines: ['inter­', 'national and co‐', 'operation'] }]));
    assert.equal(joinWords(w, 0, w.length - 1), 'international and cooperation');
  });

  it('attaches lone closing and opening punctuation', () => {
    const w = buildReadingOrder(makeWords([{ lines: ['he said “', 'stop , now ! ”'] }]));
    assert.equal(joinWords(w, 0, w.length - 1), 'he said “stop, now!”');
  });

  it('returns an empty string without a range', () => {
    assert.equal(joinWords(words, null, null), '');
    assert.equal(joinWords([], 0, 3), '');
  });
});

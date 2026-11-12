// SmartScan photo -> selection -> draft -> save -> back-to-photo flow.
// Saves go to a mock writer: no Firebase, no network, no production data.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildReadingOrder } from '../../src/components/smartscan/selection/readingOrder.js';
import { OCR_STATUS, initialWorkspaceState, workspaceReducer } from '../../src/components/smartscan/workspace/workspaceModel.js';
import { persistQuote } from '../../src/utils/quoteRecord.js';
import { PAGE, makeWords } from '../fixtures/ocrPage.js';

const words = buildReadingOrder(makeWords(PAGE));
const at = (text) => words.findIndex((w) => w.text === text);
const run = (state, ...actions) => actions.reduce(workspaceReducer, state);

function mockStore() {
  const writes = [];
  return { writes, write: async (record) => void writes.push(record) };
}

/** Saves the open draft the way SmartScanWorkspace.save() does. */
async function save(state, store, now) {
  let s = workspaceReducer(state, { type: 'SAVE_START' });
  try {
    await persistQuote(s.draft, store.write, now);
    s = workspaceReducer(s, { type: 'SAVE_SUCCESS' });
  } catch (err) {
    s = workspaceReducer(s, { type: 'SAVE_FAILURE', message: err.message });
  }
  return s;
}

const ready = () => run(initialWorkspaceState, { type: 'OCR_START' }, { type: 'OCR_SUCCESS', words });
const select = (state, a, b) => run(state, { type: 'TAP', index: at(a) }, { type: 'TAP', index: at(b) });

describe('workspace: recognition', () => {
  it('is ready with words after OCR', () => {
    const s = ready();
    assert.equal(s.ocr.status, OCR_STATUS.READY);
    assert.equal(s.words.length, words.length);
  });

  it('ignores taps while text is still being recognized', () => {
    const s = run(initialWorkspaceState, { type: 'OCR_START' }, { type: 'TAP', index: 0 });
    assert.equal(s.selection.anchor, null);
  });

  it('explains when no text was found', () => {
    const s = run(initialWorkspaceState, { type: 'OCR_START' }, { type: 'OCR_SUCCESS', words: [] });
    assert.equal(s.notice.kind, 'error');
  });
});

describe('workspace: editing OCR text before saving', () => {
  it('opens a draft with the selected passage, lets the user fix it, and saves the corrected text', async () => {
    let s = select(ready(), 'quick', 'dog');
    s = workspaceReducer(s, { type: 'OPEN_DRAFT' });
    assert.equal(s.draft.quote, 'quick brown fox jumps over the lazy dog');

    s = run(
      s,
      { type: 'EDIT_DRAFT', field: 'quote', value: 'Quick brown fox jumps over the lazy dog.' },
      { type: 'EDIT_DRAFT', field: 'author', value: 'A. Writer' },
      { type: 'EDIT_DRAFT', field: 'source', value: 'Sample Book, p. 12' },
      { type: 'EDIT_DRAFT', field: 'tags', value: [{ value: 'wisdom', label: 'Wisdom' }] },
      { type: 'EDIT_DRAFT', field: 'notes', value: 'first scan' },
    );

    const store = mockStore();
    const now = new Date('2026-11-12T10:00:00.000Z');
    s = await save(s, store, now);

    assert.deepEqual(store.writes, [
      {
        quote: 'Quick brown fox jumps over the lazy dog.',
        author: 'A. Writer',
        source: 'Sample Book, p. 12',
        tags: ['wisdom'],
        notes: 'first scan',
        createdAt: '2026-11-12T10:00:00.000Z',
      },
    ]);
    assert.equal(s.saving, false);
  });

  it('Back to photo keeps the selection so it can be adjusted', () => {
    let s = workspaceReducer(select(ready(), 'quick', 'dog'), { type: 'OPEN_DRAFT' });
    s = workspaceReducer(s, { type: 'CANCEL_DRAFT' });
    assert.equal(s.draft, null);
    assert.deepEqual([s.selection.start, s.selection.end], [at('quick'), at('dog')]);
  });

  it('a failed save keeps the draft and its edits', async () => {
    let s = workspaceReducer(select(ready(), 'quick', 'dog'), { type: 'OPEN_DRAFT' });
    s = workspaceReducer(s, { type: 'EDIT_DRAFT', field: 'quote', value: 'edited' });
    s = await save(s, { write: async () => Promise.reject(new Error('offline')) });
    assert.equal(s.draft.quote, 'edited');
    assert.equal(s.notice.kind, 'error');
  });

  it('refuses to save an empty quote', async () => {
    let s = workspaceReducer(select(ready(), 'quick', 'dog'), { type: 'OPEN_DRAFT' });
    s = workspaceReducer(s, { type: 'EDIT_DRAFT', field: 'quote', value: '   ' });
    const store = mockStore();
    s = await save(s, store);
    assert.equal(store.writes.length, 0);
    assert.ok(s.draft);
  });

  it('ignores taps on the photo while the draft is open', () => {
    let s = workspaceReducer(select(ready(), 'quick', 'dog'), { type: 'OPEN_DRAFT' });
    const before = s.selection;
    s = workspaceReducer(s, { type: 'TAP', index: 0 });
    assert.equal(s.selection, before);
  });
});

describe('workspace: returning to the photograph after saving', () => {
  it('closes the draft and keeps the photo, words, and rotation, ready for the next passage', async () => {
    let s = run(ready(), { type: 'ROTATE' }, { type: 'OCR_START' }, { type: 'OCR_SUCCESS', words });
    s = workspaceReducer(select(s, 'quick', 'dog'), { type: 'OPEN_DRAFT' });
    s = await save(s, mockStore());

    assert.equal(s.draft, null);
    assert.equal(s.rotation, 90);
    assert.equal(s.words, words);
    assert.equal(s.ocr.status, OCR_STATUS.READY);
    assert.equal(s.selection.anchor, null);
    assert.equal(s.selection.start, null);
    assert.equal(s.notice.kind, 'success');
    assert.deepEqual(s.saved, [{ start: at('quick'), end: at('dog') }]);
  });
});

describe('workspace: multiple passages from one photograph', () => {
  it('saves two passages, marks both, and carries author and source to the next draft', async () => {
    const store = mockStore();
    let s = workspaceReducer(select(ready(), 'quick', 'fox'), { type: 'OPEN_DRAFT' });
    s = run(s, { type: 'EDIT_DRAFT', field: 'author', value: 'A. Writer' }, { type: 'EDIT_DRAFT', field: 'source', value: 'Sample Book' });
    s = await save(s, store);

    // Second passage, selected in reverse, across lines.
    s = workspaceReducer(select(s, 'bering', 'patient'), { type: 'OPEN_DRAFT' });
    assert.equal(s.draft.quote, 'patient reader keeps remembering');
    assert.equal(s.draft.author, 'A. Writer');
    assert.equal(s.draft.source, 'Sample Book');
    assert.deepEqual(s.draft.tags, []);
    s = await save(s, store);

    assert.deepEqual(
      store.writes.map((w) => w.quote),
      ['quick brown fox', 'patient reader keeps remembering'],
    );
    assert.equal(s.saved.length, 2);
  });
});

describe('workspace: rotation', () => {
  it('clears words, selection, and saved marks (they belong to the old orientation)', async () => {
    let s = workspaceReducer(select(ready(), 'quick', 'fox'), { type: 'OPEN_DRAFT' });
    s = await save(s, mockStore());
    s = select(s, 'over', 'dog');
    s = workspaceReducer(s, { type: 'ROTATE' });
    assert.equal(s.rotation, 90);
    assert.deepEqual(s.words, []);
    assert.equal(s.selection.start, null);
    assert.deepEqual(s.saved, []);
    assert.equal(s.ocr.status, OCR_STATUS.IDLE);
  });

  it('is ignored while a draft is open', () => {
    const s = workspaceReducer(select(ready(), 'quick', 'fox'), { type: 'OPEN_DRAFT' });
    assert.equal(workspaceReducer(s, { type: 'ROTATE' }), s);
  });
});

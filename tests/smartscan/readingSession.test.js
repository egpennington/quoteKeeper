// Reading session: author + source carried across passages and photographs.
// Saves go to a mock writer and storage is an in-memory fake: no Firebase,
// no real localStorage, no production data.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildReadingOrder } from '../../src/components/smartscan/selection/readingOrder.js';
import {
  EMPTY_READING,
  adoptFromQuote,
  hasReading,
  loadReading,
  normalizeReading,
  readingLabel,
  saveReading,
} from '../../src/components/smartscan/readingSession.js';
import { initialWorkspaceState, workspaceReducer } from '../../src/components/smartscan/workspace/workspaceModel.js';
import { persistQuote } from '../../src/utils/quoteRecord.js';
import { PAGE, makeWords } from '../fixtures/ocrPage.js';

const words = buildReadingOrder(makeWords(PAGE));
const at = (text) => words.findIndex((w) => w.text === text);

function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => void data.set(k, String(v)),
    removeItem: (k) => void data.delete(k),
  };
}

/**
 * A small stand-in for SmartScan.jsx + SmartScanWorkspace.jsx: the session lives
 * outside the workspace, each photograph gets a brand-new workspace state.
 */
function scanner(storage = fakeStorage(), userId = 'user-1') {
  const writes = [];
  const app = {
    writes,
    storage,
    reading: loadReading(storage, userId),
    setReading(next) {
      app.reading = normalizeReading(next);
      saveReading(storage, userId, app.reading);
    },
    newStory: () => app.setReading(EMPTY_READING),
    /** Opens a new photograph and returns a draft for the passage a..b. */
    photographAndSelect(a, b) {
      let s = [{ type: 'OCR_START' }, { type: 'OCR_SUCCESS', words }, { type: 'TAP', index: at(a) }, { type: 'TAP', index: at(b) }]
        .reduce(workspaceReducer, initialWorkspaceState);
      s = workspaceReducer(s, { type: 'OPEN_DRAFT', reading: app.reading });
      return s;
    },
    async save(state, edits = {}) {
      let s = Object.entries(edits).reduce((acc, [field, value]) => workspaceReducer(acc, { type: 'EDIT_DRAFT', field, value }), state);
      s = workspaceReducer(s, { type: 'SAVE_START' });
      const saved = await persistQuote(s.draft, async (record) => void writes.push(record));
      app.setReading(adoptFromQuote(app.reading, saved));
      return workspaceReducer(s, { type: 'SAVE_SUCCESS' });
    },
  };
  return app;
}

describe('reading session basics', () => {
  it('trims values and tolerates missing or malformed input', () => {
    assert.deepEqual(normalizeReading({ author: ' Isaac Asimov ', source: ' Segregationist\n' }), { author: 'Isaac Asimov', source: 'Segregationist' });
    assert.deepEqual(normalizeReading(null), { author: '', source: '' });
    assert.deepEqual(normalizeReading({ author: 42 }), { author: '', source: '' });
  });

  it('labels as "Source · Author", or whichever is set', () => {
    assert.equal(readingLabel({ author: 'Isaac Asimov', source: 'Segregationist' }), 'Segregationist · Isaac Asimov');
    assert.equal(readingLabel({ author: 'Isaac Asimov', source: '' }), 'Isaac Asimov');
    assert.equal(readingLabel(EMPTY_READING), '');
    assert.equal(hasReading(EMPTY_READING), false);
  });
});

describe('author and source persist across multiple photographs', () => {
  it('a session set up front fills every quote on every photo', async () => {
    const app = scanner();
    app.setReading({ author: 'Isaac Asimov', source: 'Segregationist' });

    let s = app.photographAndSelect('quick', 'fox'); // photo 1
    assert.deepEqual([s.draft.author, s.draft.source], ['Isaac Asimov', 'Segregationist']);
    s = await app.save(s);

    s = app.photographAndSelect('lazy', 'dog'); // photo 2: a brand-new workspace
    assert.deepEqual([s.draft.author, s.draft.source], ['Isaac Asimov', 'Segregationist']);
    await app.save(s);

    s = app.photographAndSelect('patient', 'reader'); // photo 3
    await app.save(s);

    assert.deepEqual(
      app.writes.map((w) => [w.author, w.source]),
      Array(3).fill(['Isaac Asimov', 'Segregationist']),
    );
  });

  it('typing author and source once in the first quote starts the session', async () => {
    const app = scanner();
    let s = app.photographAndSelect('quick', 'fox');
    assert.deepEqual([s.draft.author, s.draft.source], ['', '']);
    await app.save(s, { author: 'Isaac Asimov', source: 'Segregationist' });

    s = app.photographAndSelect('lazy', 'dog'); // next photograph
    assert.deepEqual([s.draft.author, s.draft.source], ['Isaac Asimov', 'Segregationist']);
  });

  it('survives the page reloading between photographs (e.g. after the camera app returns)', async () => {
    const storage = fakeStorage();
    const before = scanner(storage);
    before.setReading({ author: 'Isaac Asimov', source: 'Segregationist' });

    const afterReload = scanner(storage); // new app instance, same device
    const s = afterReload.photographAndSelect('quick', 'fox');
    assert.deepEqual([s.draft.author, s.draft.source], ['Isaac Asimov', 'Segregationist']);
  });

  it('editing one quote’s author or source does not change the session', async () => {
    const app = scanner();
    app.setReading({ author: 'Isaac Asimov', source: 'Segregationist' });
    let s = app.photographAndSelect('quick', 'fox');
    await app.save(s, { author: 'Someone Quoted', source: 'Segregationist, epigraph' });
    assert.deepEqual([app.writes[0].author, app.writes[0].source], ['Someone Quoted', 'Segregationist, epigraph']);

    s = app.photographAndSelect('lazy', 'dog');
    assert.deepEqual([s.draft.author, s.draft.source], ['Isaac Asimov', 'Segregationist']);
  });

  it('a session with only an author learns the source from the next quote, and keeps the author', async () => {
    const app = scanner();
    app.setReading({ author: 'Isaac Asimov', source: '' });
    const s = app.photographAndSelect('quick', 'fox');
    await app.save(s, { author: 'Different Person', source: 'Nightfall' });
    assert.deepEqual(app.reading, { author: 'Isaac Asimov', source: 'Nightfall' });
  });
});

describe('changing the current story', () => {
  it('new values apply from the next quote on; earlier quotes keep what they were saved with', async () => {
    const app = scanner();
    app.setReading({ author: 'Isaac Asimov', source: 'Segregationist' });
    await app.save(app.photographAndSelect('quick', 'fox'));

    app.setReading({ author: 'Ursula K. Le Guin', source: 'The Dispossessed' });
    const s = app.photographAndSelect('lazy', 'dog');
    assert.deepEqual([s.draft.author, s.draft.source], ['Ursula K. Le Guin', 'The Dispossessed']);
    await app.save(s);

    assert.deepEqual(app.writes.map((w) => w.source), ['Segregationist', 'The Dispossessed']);
  });

  it('a draft that is already open keeps its own values when the session changes', () => {
    const app = scanner();
    app.setReading({ author: 'Isaac Asimov', source: 'Segregationist' });
    const s = app.photographAndSelect('quick', 'fox');
    app.setReading({ author: 'Other', source: 'Other' });
    assert.deepEqual([s.draft.author, s.draft.source], ['Isaac Asimov', 'Segregationist']);
  });
});

describe('clearing the reading session (New Story)', () => {
  it('the next draft is blank: the previous author and source are not applied', async () => {
    const app = scanner();
    app.setReading({ author: 'Isaac Asimov', source: 'Segregationist' });
    await app.save(app.photographAndSelect('quick', 'fox'));

    app.newStory();
    const s = app.photographAndSelect('lazy', 'dog');
    assert.deepEqual([s.draft.author, s.draft.source], ['', '']);
    assert.equal(hasReading(app.reading), false);
  });

  it('saving a quote with no author/source after New Story leaves the session empty', async () => {
    const app = scanner();
    app.setReading({ author: 'Isaac Asimov', source: 'Segregationist' });
    app.newStory();
    await app.save(app.photographAndSelect('quick', 'fox'));
    assert.deepEqual([app.writes[0].author, app.writes[0].source], ['', '']);
    assert.deepEqual(app.reading, { author: '', source: '' });
  });

  it('the new story’s first quote sets the new session; the old one never returns', async () => {
    const app = scanner();
    app.setReading({ author: 'Isaac Asimov', source: 'Segregationist' });
    app.newStory();
    await app.save(app.photographAndSelect('quick', 'fox'), { author: 'Ted Chiang', source: 'Exhalation' });
    const s = app.photographAndSelect('lazy', 'dog');
    assert.deepEqual([s.draft.author, s.draft.source], ['Ted Chiang', 'Exhalation']);
    assert.ok(!JSON.stringify([...app.storage.data.values()]).includes('Asimov'));
  });

  it('stays cleared after a reload (nothing left on the device)', () => {
    const storage = fakeStorage();
    const app = scanner(storage);
    app.setReading({ author: 'Isaac Asimov', source: 'Segregationist' });
    app.newStory();
    assert.equal(storage.data.size, 0);
    assert.deepEqual(scanner(storage).reading, { author: '', source: '' });
  });
});

describe('reading session storage', () => {
  it('is kept per signed-in user', () => {
    const storage = fakeStorage();
    saveReading(storage, 'user-1', { author: 'A', source: 'B' });
    assert.deepEqual(loadReading(storage, 'user-1'), { author: 'A', source: 'B' });
    assert.deepEqual(loadReading(storage, 'user-2'), { author: '', source: '' });
  });

  it('falls back to an empty session for corrupt data or blocked storage', () => {
    const corrupt = fakeStorage({ 'quotekeeper.smartscan.reading.v1.user-1': '{not json' });
    assert.deepEqual(loadReading(corrupt, 'user-1'), { author: '', source: '' });
    assert.deepEqual(loadReading(null, 'user-1'), { author: '', source: '' });
    assert.doesNotThrow(() => saveReading(null, 'user-1', { author: 'A', source: 'B' }));
  });

  it('stores only author and source (no quote text)', async () => {
    const app = scanner();
    await app.save(app.photographAndSelect('quick', 'fox'), { author: 'A', source: 'B' });
    assert.deepEqual([...app.storage.data.values()], ['{"author":"A","source":"B"}']);
  });
});

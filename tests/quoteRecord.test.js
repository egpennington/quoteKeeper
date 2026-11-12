// The Firestore `quotes` document shape. Uses a mock writer only.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildQuoteRecord, persistQuote } from '../src/utils/quoteRecord.js';

const NOW = new Date('2026-11-12T09:30:00.000Z');

describe('quote record', () => {
  it('has exactly the existing fields, in the existing order', () => {
    const record = buildQuoteRecord({ quote: 'q', author: 'a', source: 's', tags: [], notes: 'n' }, NOW);
    assert.deepEqual(Object.keys(record), ['quote', 'author', 'source', 'tags', 'notes', 'createdAt']);
  });

  it('matches what manual entry wrote before this sprint (react-select tag options → strings)', () => {
    const draft = {
      quote: 'Be kind.',
      author: 'Someone',
      source: '',
      tags: [
        { value: 'kindness', label: 'Kindness' },
        { value: 'my-tag', label: 'my-tag', __isNew__: true },
      ],
      notes: '',
    };
    assert.deepEqual(buildQuoteRecord(draft, NOW), {
      quote: 'Be kind.',
      author: 'Someone',
      source: '',
      tags: ['kindness', 'my-tag'],
      notes: '',
      createdAt: '2026-11-12T09:30:00.000Z',
    });
  });

  it('trims surrounding whitespace from quote, author, and source', () => {
    const r = buildQuoteRecord({ quote: '  hello \n', author: ' A ', source: ' B ' }, NOW);
    assert.deepEqual([r.quote, r.author, r.source], ['hello', 'A', 'B']);
  });

  it('persistQuote writes once and returns the record', async () => {
    const writes = [];
    const record = await persistQuote({ quote: 'x' }, async (r) => void writes.push(r), NOW);
    assert.deepEqual(writes, [record]);
  });

  it('persistQuote rejects an empty quote without writing', async () => {
    const writes = [];
    await assert.rejects(persistQuote({ quote: '  ' }, async (r) => void writes.push(r), NOW));
    assert.equal(writes.length, 0);
  });
});

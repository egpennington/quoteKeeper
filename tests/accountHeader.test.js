import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { showsAccountHeader } from '../src/utils/accountHeader.js';

describe('account header visibility', () => {
  it('is shown on the main QuoteKeeper screen', () => {
    assert.equal(showsAccountHeader('form'), true);
  });

  it('is hidden in SmartScan and in Q Library', () => {
    assert.equal(showsAccountHeader('scan'), false);
    assert.equal(showsAccountHeader('library'), false);
  });
});

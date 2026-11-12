// SmartScan photo flow (Sprint 1), with the workspace as the photo stage.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { STAGES, initialScanState, scanReducer } from '../../src/components/smartscan/scanModel.js';

const image = { url: 'blob:x', source: 'upload', width: 3000, height: 4000 };
const run = (...actions) => actions.reduce(scanReducer, initialScanState);

describe('photo flow', () => {
  it('opens the workspace once a photo loads', () => {
    const s = run({ type: 'LOAD_START' }, { type: 'LOAD_SUCCESS', image });
    assert.equal(s.stage, STAGES.WORKSPACE);
    assert.equal(s.image, image);
    assert.equal(s.busy, false);
  });

  it('closing the photo returns to Take/Upload and releases it', () => {
    const s = run({ type: 'LOAD_SUCCESS', image }, { type: 'REMOVE_IMAGE' });
    assert.equal(s.stage, STAGES.SOURCE);
    assert.equal(s.image, null);
  });

  it('camera open/cancel returns to the source picker when there is no photo', () => {
    const s = run({ type: 'OPEN_CAMERA' }, { type: 'CLOSE_CAMERA' });
    assert.equal(s.stage, STAGES.SOURCE);
  });

  it('camera errors are shown on the source picker', () => {
    const s = run({ type: 'OPEN_CAMERA' }, { type: 'CLOSE_CAMERA', notice: { kind: 'error', text: 'blocked' } });
    assert.equal(s.notice.text, 'blocked');
  });

  it('a failed load stays on the picker with an error', () => {
    const s = run({ type: 'LOAD_START' }, { type: 'LOAD_FAILURE', message: 'bad file' });
    assert.equal(s.stage, STAGES.SOURCE);
    assert.equal(s.busy, false);
    assert.equal(s.notice.kind, 'error');
  });
});

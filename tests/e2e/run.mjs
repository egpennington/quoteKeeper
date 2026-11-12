// SmartScan end-to-end browser checks against the real App.jsx, Firebase mocked.
// Usage: npm run test:e2e          against the dev server (fast)
//        npm run test:e2e:build    against a real production build
// See tests/e2e/README.md.
//
// Starts its own mocked dev server and headless Chrome, emulates a 390x844 touch
// phone, drives the app with real touch events, and prints PASS/FAIL per check.
// Exit code 0 only if every check passes.
import { readFileSync } from 'node:fs';
import { launch } from './cdp.mjs';
import { startServer } from './server.mjs';

const server = await startServer({ built: process.argv.includes('--build') || process.env.E2E_BUILD === '1' });
const APP = server.url;
console.log(`Testing ${server.mode} at ${APP}\n`);

// The synthetic page generator is handed to the page as source text, so it also
// works against a production build (which doesn't serve the benchmark folder).
const SAMPLES_SRC = readFileSync(new URL('../../benchmark/ocr/samples.js', import.meta.url), 'utf8');
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

const HELPERS = `
window.__h = {
  async loadSample(id, rotateCCW = false, selector = 'input[aria-label="Upload a photo from this device"]') {
    window.__samplesUrl ??= URL.createObjectURL(new Blob([window.__samplesSrc], { type: 'text/javascript' }));
    const { SAMPLE_SPECS, renderSample } = await import(window.__samplesUrl);
    const s = await renderSample(SAMPLE_SPECS.find((x) => x.id === id));
    let file = s.file;
    if (rotateCCW) {
      const bmp = await createImageBitmap(file);
      const c = document.createElement('canvas');
      c.width = bmp.height; c.height = bmp.width;
      const ctx = c.getContext('2d');
      ctx.translate(0, c.height); ctx.rotate(-Math.PI / 2); ctx.drawImage(bmp, 0, 0);
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
      file = new File([blob], 'rotated.jpg', { type: 'image/jpeg' });
    }
    window.__gt = s.gtWords;
    const input = document.querySelector(selector);
    const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return { n: s.gtWords.length, w: s.width, h: s.height };
  },
  view() {
    const vp = document.querySelector('.ssw-viewport').getBoundingClientRect();
    const pg = document.querySelector('.ssw-page');
    const m = /translate3d\\(([-\\d.e]+)px, ([-\\d.e]+)px/.exec(pg.style.transform);
    return { left: vp.left, top: vp.top, vw: vp.width, vh: vp.height, tx: +m[1], ty: +m[2],
      pageCssW: parseFloat(pg.style.width), pageCssH: parseFloat(pg.style.height) };
  },
  wordScreen(i, pagePxW) {
    const v = this.view(); const s = v.pageCssW / pagePxW; const b = window.__gt[i].bbox;
    return { x: v.left + v.tx + ((b.x0 + b.x1) / 2) * s, y: v.top + v.ty + ((b.y0 + b.y1) / 2) * s, s,
      inView: true };
  },
  gtJoin(a, b) { return window.__gt.slice(Math.min(a, b), Math.max(a, b) + 1).map((w) => w.text).join(' '); },
  gtText(i) { return window.__gt[i].text; },
  panelText() { return document.querySelector('.ssw-panel-text')?.textContent ?? null; },
  status() { return document.querySelector('.ssw-status')?.textContent ?? null; },
  rectsAligned() {
    const a = document.querySelector('.ssw-photo').getBoundingClientRect();
    const b = document.querySelector('.ssw-overlay').getBoundingClientRect();
    const d = Math.max(Math.abs(a.left - b.left), Math.abs(a.top - b.top), Math.abs(a.width - b.width), Math.abs(a.height - b.height));
    return d;
  },
  setField(selector, value, index = 0) {
    const el = document.querySelectorAll(selector)[index];
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  },
  layout() {
    const ws = document.querySelector('.ss-workspace').getBoundingClientRect();
    const btns = [...document.querySelectorAll('.ss-workspace button')].map((b) => {
      // The reading-session button's tap target is the whole top-bar centre (its ::before).
      const r = (b.classList.contains('ssw-reading') ? b.parentElement : b).getBoundingClientRect();
      return { label: b.getAttribute('aria-label') || b.textContent.trim(), w: r.width, h: r.height,
        inside: r.left >= -0.5 && r.top >= -0.5 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5 };
    });
    const vp = document.querySelector('.ssw-viewport').getBoundingClientRect();
    const panel = document.querySelector('.ssw-panel')?.getBoundingClientRect();
    return { ws: [ws.left, ws.top, ws.width, ws.height], inner: [innerWidth, innerHeight],
      hScroll: document.documentElement.scrollWidth > innerWidth, btns,
      vpBottom: vp.bottom, panelTop: panel ? panel.top : null, panelBottom: panel ? panel.bottom : null };
  },
};
true;
`;

const b = await launch();
const { waitFor, tap, pinch, drag, click, delay } = b;
// Installing the helpers always brings the sample generator along.
const ev = (expr) => (expr === HELPERS ? b.evaluate(`window.__samplesSrc = ${JSON.stringify(SAMPLES_SRC)};\n${HELPERS}`) : b.evaluate(expr));
const h = (expr) => ev(`window.__h.${expr}`);

async function ensureVisible(i, pageW) {
  for (let k = 0; k < 4; k++) {
    const p = await h(`wordScreen(${i}, ${pageW})`);
    const v = await h('view()');
    const margin = 40;
    const dx = p.x < v.left + margin ? v.left + v.vw / 2 - p.x : p.x > v.left + v.vw - margin ? v.left + v.vw / 2 - p.x : 0;
    // Also keep clear of the zoom buttons floating in the bottom-right corner.
    const underZoom = p.x > v.left + v.vw - 175 && p.y > v.top + v.vh - 75;
    const dy = p.y < v.top + margin || p.y > v.top + v.vh - margin || underZoom ? v.top + v.vh / 2 - p.y : 0;
    if (!dx && !dy) return p;
    const cx = v.left + v.vw / 2;
    const cy = v.top + v.vh / 2;
    await drag(cx, cy, cx + Math.sign(dx) * Math.min(Math.abs(dx) + 12, v.vw / 2 - 5), cy + Math.sign(dy) * Math.min(Math.abs(dy) + 12, v.vh / 2 - 5));
  }
  return h(`wordScreen(${i}, ${pageW})`);
}
async function tapWord(i, pageW) {
  const p = await ensureVisible(i, pageW);
  await tap(p.x, p.y);
  return p;
}

try {
  await b.send('Browser.grantPermissions', { origin: APP.slice(0, -1), permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
  await b.viewport(390, 844);
  await b.goto(APP);
  await waitFor(`!!document.querySelector('.app-header')`, 20000, 'app header');
  await ev(HELPERS);

  // ---- Header and lazy loading ------------------------------------------
  check('Header shows signed-in email on the main form', await ev(`document.querySelector('.app-header').textContent.includes('tester@example.test')`));
  await ev(`[...document.querySelectorAll('button')].find((x) => x.textContent.includes('SmartScan')).click()`);
  await waitFor(`!!document.querySelector('.smartscan')`);
  check('Header (email + Sign out) hidden while SmartScan is open', await ev(`!document.querySelector('.app-header') && ![...document.querySelectorAll('button')].some((x) => x.textContent.trim() === 'Sign out')`));
  check('Hiding the header does not sign out', (await ev('window.__auth.signOutCalls')) === 0);
  check('Workspace/OCR code not loaded before a photo is opened', !b.requests.some((u) => /SmartScanWorkspace|ocrEngine|\/ocr\//.test(u)));

  // ---- Open a photo -------------------------------------------------------
  const sample = await h(`loadSample('clean')`);
  await waitFor(`!!document.querySelector('.ssw-photo') && document.querySelector('.ssw-photo').complete`, 20000, 'workspace photo');
  const img = await ev(`(() => { const i = document.querySelector('.ssw-photo'); return { nw: i.naturalWidth, nh: i.naturalHeight, src: i.src.slice(0, 5) }; })()`);
  check('Workspace opens straight from the photo, at original resolution', img.nw === 3024 && img.nh === 4032 && img.src === 'blob:', `${img.nw}×${img.nh} ${img.src}`);
  const t0 = Date.now();
  await waitFor(`window.__h.status() === 'Tap the first word of a passage.'`, 120000, 'OCR ready');
  check('On-device OCR completes and prompts for the first word', true, `${((Date.now() - t0) / 1000).toFixed(1)} s on desktop, ${sample.n} ground-truth words`);
  check('OCR assets served from this origin only', b.requests.filter((u) => /tesseract|traineddata|worker\.min/.test(u)).every((u) => u.startsWith(APP)));

  let L = await h('layout()');
  check('Workspace fills the phone screen, no horizontal scroll', L.ws.join() === '0,0,390,844' && !L.hScroll, L.ws.join());
  check('All workspace buttons on screen and ≥44 px', L.btns.every((x) => x.inside && x.h >= 44 && x.w >= 44), L.btns.map((x) => `${x.label}:${Math.round(x.w)}x${Math.round(x.h)}${x.inside ? '' : '(off)'}`).join(' '));
  const zoomRow = await ev(`(() => { const vp = document.querySelector('.ssw-viewport').getBoundingClientRect(); return [...document.querySelectorAll('.ssw-zoom button')].map((x) => { const r = x.getBoundingClientRect(); return { top: Math.round(r.top), fromRight: Math.round(vp.right - r.right), fromBottom: Math.round(vp.bottom - r.bottom) }; }); })()`);
  check('Zoom controls are one row in the bottom-right corner of the photo', zoomRow.length === 3 && zoomRow.every((z) => z.top === zoomRow[0].top && z.fromBottom >= 0 && z.fromBottom <= 16) && Math.min(...zoomRow.map((z) => z.fromRight)) <= 16,
    JSON.stringify(zoomRow));
  check('Overlay aligned with photo at fit', (await h('rectsAligned()')) < 1, `${(await h('rectsAligned()')).toFixed(3)} px`);

  // ---- Pinch zoom ---------------------------------------------------------
  const A = 30; // a body word a few lines down
  const B = A + 24; // a few lines later
  let before = await h(`wordScreen(${A}, 3024)`);
  const v0 = await h('view()');
  await pinch(before.x, before.y, 80, 260);
  const v1 = await h('view()');
  let after = await h(`wordScreen(${A}, 3024)`);
  const ratio = v1.pageCssW / v0.pageCssW;
  check('Pinch zooms in', ratio > 2.5, `×${ratio.toFixed(2)}`);
  check('Pinch keeps the word under the fingers', Math.hypot(after.x - before.x, after.y - before.y) < 12, `moved ${Math.hypot(after.x - before.x, after.y - before.y).toFixed(1)} px`);
  check('Overlay aligned with photo after pinch', (await h('rectsAligned()')) < 1);
  check('Browser page zoom unaffected (visualViewport.scale = 1)', (await ev('visualViewport.scale')) === 1);

  // ---- Two-tap selection --------------------------------------------------
  const expected = await h(`gtJoin(${A}, ${B})`);
  await tapWord(A, 3024);
  check('Tap 1 anchors the first word', (await h('status()')) === 'Now tap the last word.' && (await ev(`document.querySelectorAll('.ssw-anchor').length`)) === 1,
    await ev(`document.querySelector('.ssw-panel-hint')?.textContent`));
  await tapWord(B, 3024);
  const got = await h('panelText()');
  const lines = await ev(`document.querySelectorAll('.ssw-sel').length`);
  check('Tap 2 selects every word between, across lines', got === expected, `${lines} highlighted lines; “${got}”`);
  if (got !== expected) console.log('   expected:', expected);
  check('Passage spans multiple lines (one highlight per line)', lines >= 2);
  L = await h('layout()');
  check('Selection panel sits below the photo, not over it', L.panelTop !== null && L.vpBottom <= L.panelTop + 0.5 && L.panelBottom <= 844.5, `viewport bottom ${L.vpBottom}, panel ${L.panelTop}-${L.panelBottom}`);

  await tapWord(B, 3024);
  await tapWord(A, 3024);
  check('Reverse selection (last word first) gives the same passage, started immediately', (await h('panelText()')) === expected);

  // Quick successive taps must select, not zoom.
  const vq = await h('view()');
  // Centre the pair, then make sure neither word is under the floating zoom buttons.
  await ensureVisible(A + 1, 3024);
  const vv = await h('view()');
  const clear = (p) => p.x > vv.left + 20 && p.x < vv.left + vv.vw - 20 && p.y > vv.top + 20 && p.y < vv.top + vv.vh - 75;
  const p1 = await h(`wordScreen(${A}, 3024)`);
  const p2 = await h(`wordScreen(${A + 3}, 3024)`);
  if (!clear(p1) || !clear(p2)) {
    const dx = vv.left + vv.vw / 2 - (p1.x + p2.x) / 2;
    await drag(vv.vw / 2, vv.top + vv.vh / 2, vv.vw / 2 + dx + Math.sign(dx) * 10, vv.top + vv.vh / 2);
    Object.assign(p1, await h(`wordScreen(${A}, 3024)`));
    Object.assign(p2, await h(`wordScreen(${A + 3}, 3024)`));
  }
  const vqStart = await h('view()');
  await tap(p1.x, p1.y);
  await delay(20);
  await tap(p2.x, p2.y);
  const vq2 = await h('view()');
  check('Two quick taps select a passage (no double-tap zoom)', (await h('panelText()')) === (await h(`gtJoin(${A}, ${A + 3})`)) && Math.abs(vq2.pageCssW - vqStart.pageCssW) < 0.01 && Math.abs(vq2.pageCssW - vq.pageCssW) < 0.01,
    `${await h('panelText()')} (taps ${Math.round(p1.x)},${Math.round(p1.y)} → ${Math.round(p2.x)},${Math.round(p2.y)}, 20 ms apart)`);

  await click('.ssw-clear');
  check('Clear removes the selection', (await ev(`!document.querySelector('.ssw-panel')`)) && (await ev(`document.querySelectorAll('.ssw-sel,.ssw-anchor').length`)) === 0);

  // ---- Copy ---------------------------------------------------------------
  await tapWord(A, 3024);
  await tapWord(A + 5, 3024);
  await ev(`[...document.querySelectorAll('.ssw-panel button')].find((x) => x.textContent.trim() === 'Copy').click()`);
  await delay(300);
  const clip = await ev(`navigator.clipboard.readText().catch((e) => 'ERR ' + e.message)`);
  check('Copy puts the passage on the clipboard', clip === (await h(`gtJoin(${A}, ${A + 5})`)), clip);

  // ---- Add Quote, edit, save, return --------------------------------------
  await tapWord(A, 3024);
  await tapWord(B, 3024);
  const viewBeforeSave = await h('view()');
  await ev(`[...document.querySelectorAll('.ssw-panel button')].find((x) => x.textContent.trim() === 'Add Quote').click()`);
  await waitFor(`!!document.querySelector('.ssw-sheet')`);
  check('Add Quote opens an editable draft with the passage', (await ev(`document.querySelector('.ssw-quote-text').value`)) === expected);
  check('Draft fields: quote, author, source, tags, notes', await ev(`(() => { const t = document.querySelector('.ssw-sheet').textContent; return ['Quote','Author','Source','Tags','Notes'].every((k) => t.includes(k)); })()`));
  const corrected = expected.replace(/^\S+/, (w) => w.toUpperCase()) + ' [corrected]';
  await h(`setField('.ssw-quote-text', ${JSON.stringify(corrected)})`);
  await h(`setField('.ssw-sheet input[type=text]', 'Test Author')`);
  await ev(`(() => { const i = [...document.querySelectorAll('.ssw-sheet input.quote-input')][1]; window.__h.setField = window.__h.setField; const proto = HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(i, 'Synthetic Book, p. 47'); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await ev(`(() => { const ts = document.querySelectorAll('.ssw-sheet textarea'); const n = ts[ts.length - 1]; Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(n, 'scanned in test'); n.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await ev(`[...document.querySelectorAll('.ssw-sheet button')].find((x) => x.textContent.includes('Save')).click()`);
  await waitFor(`!document.querySelector('.ssw-sheet')`, 5000, 'sheet closes');
  const w1 = await ev('window.__fs.writes');
  check('Save writes one quote to the `quotes` collection with the corrected text', w1.length === 1 && w1[0].collection === 'quotes' && w1[0].data.quote === corrected, JSON.stringify(w1[0]?.data));
  check('Saved document uses the existing field set and order', JSON.stringify(Object.keys(w1[0].data)) === JSON.stringify(['quote', 'author', 'source', 'tags', 'notes', 'createdAt'])
    && w1[0].data.author === 'Test Author' && w1[0].data.source === 'Synthetic Book, p. 47' && Array.isArray(w1[0].data.tags) && w1[0].data.notes === 'scanned in test' && !Number.isNaN(Date.parse(w1[0].data.createdAt)));
  const viewAfterSave = await h('view()');
  check('After saving: same photo, same zoom and position', (await ev(`!!document.querySelector('.ssw-photo')`)) && Math.abs(viewAfterSave.pageCssW - viewBeforeSave.pageCssW) < 0.01 && Math.abs(viewAfterSave.tx - viewBeforeSave.tx) < 0.5 && Math.abs(viewAfterSave.ty - viewBeforeSave.ty) < 0.5);
  check('After saving: selection cleared, saved passage marked, ready for the next', (await ev(`document.querySelectorAll('.ssw-saved').length`)) >= 2 && !(await ev(`!!document.querySelector('.ssw-panel')`)) && (await h('status()')) === 'Tap the first word of a passage.',
    await ev(`document.querySelector('.ssw-toast')?.textContent`));

  // ---- Second passage, with a failed save first -----------------------------
  const C = B + 6;
  const D = B + 14;
  await tapWord(C, 3024);
  await tapWord(D, 3024);
  await ev(`[...document.querySelectorAll('.ssw-panel button')].find((x) => x.textContent.trim() === 'Add Quote').click()`);
  await waitFor(`!!document.querySelector('.ssw-sheet')`);
  check('Next draft is prefilled with the same author and source', (await ev(`[...document.querySelectorAll('.ssw-sheet input.quote-input')].map((i) => i.value).join('|')`)) === 'Test Author|Synthetic Book, p. 47');
  await ev('window.__fs.failNext = true');
  await ev(`[...document.querySelectorAll('.ssw-sheet button')].find((x) => x.textContent.includes('Save')).click()`);
  await waitFor(`!!document.querySelector('.ssw-sheet .ss-notice--error')`, 5000, 'save error');
  check('A failed save keeps the draft open with an error', (await ev(`!!document.querySelector('.ssw-sheet')`)) && (await ev('window.__fs.writes.length')) === 1);
  await ev(`[...document.querySelectorAll('.ssw-sheet button')].find((x) => x.textContent.includes('Save')).click()`);
  await waitFor(`!document.querySelector('.ssw-sheet')`, 5000, 'sheet closes after retry');
  const w2 = await ev('window.__fs.writes');
  check('Second passage from the same photo saved', w2.length === 2 && w2[1].data.quote === (await h(`gtJoin(${C}, ${D})`)), w2[1]?.data.quote);

  // ---- Zoom controls ------------------------------------------------------
  await click('.ssw-zoom button[aria-label="Fit whole page"]');
  const vf = await h('view()');
  check('Fit button shows the whole page', Math.abs(vf.pageCssW - 390) < 0.5 || Math.abs(vf.pageCssH - vf.vh) < 0.5, `${vf.pageCssW.toFixed(1)}×${vf.pageCssH.toFixed(1)} in ${vf.vw}×${vf.vh}`);
  check('Zoom out disabled at whole page', await ev(`document.querySelector('.ssw-zoom button[aria-label="Zoom out"]').disabled`));
  await click('.ssw-zoom button[aria-label="Zoom in"]');
  check('Zoom in button zooms', (await h('view()')).pageCssW > vf.pageCssW * 1.5);
  check('Overlay aligned with photo after button zoom', (await h('rectsAligned()')) < 1);
  for (let i = 0; i < 3; i++) await drag(195, 650, 195, 150);
  const vPad = await h('view()');
  check('The page can be dragged up past its bottom edge so no line stays under the zoom controls', Math.abs(vPad.vh - (vPad.ty + vPad.pageCssH) - 64) < 1.5,
    `gap below page: ${(vPad.vh - (vPad.ty + vPad.pageCssH)).toFixed(1)} px`);

  // ---- Close photo, back to app, manual entry still works -------------------
  await click('.ssw-topbar button[aria-label="Close photo"]');
  await waitFor(`!document.querySelector('.ss-workspace') && !!document.querySelector('.ss-source')`);
  check('Close photo returns to Take/Upload Photo', true);
  await click('.ss-back-button');
  await waitFor(`!!document.querySelector('.app-header')`);
  check('Leaving SmartScan restores the header', true);
  await h(`setField('.quote-form .quote-textarea', 'Manual quote still works')`);
  await h(`setField('.quote-form input.quote-input', 'Manual Author')`);
  await ev(`document.querySelector('.quote-form .quote-button').click()`);
  await waitFor('window.__fs.writes.length === 3', 5000, 'manual save');
  const w3 = (await ev('window.__fs.writes'))[2].data;
  check('Manual quote entry saves the same document shape', JSON.stringify(Object.keys(w3)) === JSON.stringify(['quote', 'author', 'source', 'tags', 'notes', 'createdAt']) && w3.quote === 'Manual quote still works' && w3.author === 'Manual Author', JSON.stringify(w3));
  check('Manual form clears after save', (await ev(`document.querySelector('.quote-form .quote-textarea').value`)) === '');

  // ---- Rotation -------------------------------------------------------------
  await ev(`[...document.querySelectorAll('button')].find((x) => x.textContent.includes('SmartScan')).click()`);
  await waitFor(`!!document.querySelector('.ss-source')`);
  await h(`loadSample('clean', true)`);
  await waitFor(`!!document.querySelector('.ssw-photo') && document.querySelector('.ssw-photo').complete`, 20000);
  const sideways = await h('view()');
  check('Sideways photo opens landscape', sideways.pageCssW > sideways.pageCssH);
  await click('.ssw-topbar button[aria-label="Rotate photo 90 degrees clockwise"]');
  await delay(100);
  const up = await h('view()');
  check('Rotate turns the page upright and refits', up.pageCssH > up.pageCssW && Math.abs(up.pageCssW / up.pageCssH - 0.75) < 0.01, `${up.pageCssW.toFixed(1)}×${up.pageCssH.toFixed(1)}`);
  check('Rotated photo and overlay aligned', (await h('rectsAligned()')) < 1, `${(await h('rectsAligned()')).toFixed(3)} px`);
  await waitFor(`window.__h.status() === 'Tap the first word of a passage.'`, 120000, 'OCR after rotate');
  const ws = await h(`wordScreen(${A}, 3024)`);
  await pinch(ws.x, ws.y, 80, 240);
  await tapWord(A, 3024);
  await tapWord(B, 3024);
  check('Selection after rotation (OCR boxes in rotated space) is exact', (await h('panelText()')) === expected, await h('panelText()'));

  // ---- Landscape phone layout ---------------------------------------------
  await b.viewport(844, 390);
  await delay(300);
  L = await h('layout()');
  check('Landscape: workspace fills screen, controls on screen, panel below photo', L.ws.join() === '0,0,844,390' && !L.hScroll && L.btns.every((x) => x.inside) && L.vpBottom <= L.panelTop + 0.5,
    `${L.ws.join()} viewport bottom ${L.vpBottom} panel ${L.panelTop}-${L.panelBottom}; off: ${L.btns.filter((x) => !x.inside).map((x) => x.label).join(',')}`);
  check('Landscape: overlay aligned', (await h('rectsAligned()')) < 1);
  await b.viewport(390, 844);
  await delay(300);

  // ---- Reading session across photographs ------------------------------------
  // This is the second photograph. Author and source were typed once, in the
  // first photo's first draft.
  const draftAS = () => ev(`[...document.querySelectorAll('.ssw-sheet input.quote-input')].map((i) => i.value).join('|')`);
  const panelBtn = (label) => ev(`[...document.querySelectorAll('.ssw-panel button')].find((x) => x.textContent.trim() === '${label}').click()`);
  const sheetBtn = (label) => ev(`[...document.querySelectorAll('.ssw-sheet button')].find((x) => x.textContent.trim().startsWith('${label}')).click()`);
  const sheetGone = () => waitFor(`!document.querySelector('.ssw-sheet')`, 5000, 'sheet closes');
  const readingLine = () => ev(`document.querySelector('.ssw-reading').textContent.trim()`);
  const lastWrite = () => ev(`window.__fs.writes[window.__fs.writes.length - 1].data`);
  const stored = () => ev(`Object.keys(localStorage).filter((k) => k.startsWith('quotekeeper.smartscan.reading')).map((k) => localStorage.getItem(k))`);

  check('Second photograph: top bar shows the reading session', (await readingLine()).endsWith('Synthetic Book, p. 47 · Test Author'), await readingLine());
  await panelBtn('Add Quote');
  await waitFor(`!!document.querySelector('.ssw-sheet')`);
  check('Second photograph: draft prefilled with the same author and source', (await draftAS()) === 'Test Author|Synthetic Book, p. 47', await draftAS());
  check('Draft explains that changes apply to this quote only', await ev(`document.querySelector('.ssw-session-hint').textContent.includes('this quote only')`));
  await h(`setField('.ssw-sheet input.quote-input', 'One-off Author', 0)`);
  await sheetBtn('Save');
  await sheetGone();
  const oneOff = await lastWrite();
  check('Editing one quote’s author saves it for that quote only; the session is unchanged', oneOff.author === 'One-off Author' && oneOff.source === 'Synthetic Book, p. 47' && (await readingLine()).endsWith('Synthetic Book, p. 47 · Test Author'),
    `${oneOff.author} | ${await readingLine()}`);

  // Change the story from the workspace top bar.
  await click('.ssw-reading');
  await waitFor(`!!document.querySelector('#ssw-reading-title')`);
  await h(`setField('.ssw-sheet .ss-reading-form input', 'Isaac Asimov', 0)`);
  await h(`setField('.ssw-sheet .ss-reading-form input', 'Segregationist', 1)`);
  await sheetBtn('Save');
  await sheetGone();
  check('Changing the story updates the top bar', (await readingLine()).endsWith('Segregationist · Isaac Asimov'), await readingLine());
  await tapWord(C, 3024);
  await tapWord(D, 3024);
  await panelBtn('Add Quote');
  await waitFor(`!!document.querySelector('.ssw-sheet')`);
  check('After changing the story, the next draft uses the new author and source', (await draftAS()) === 'Isaac Asimov|Segregationist', await draftAS());
  await sheetBtn('Save');
  await sheetGone();
  const changed = await lastWrite();
  check('Quote saved with the new story’s author and source (existing fields only)', changed.author === 'Isaac Asimov' && changed.source === 'Segregationist' && JSON.stringify(Object.keys(changed)) === JSON.stringify(['quote', 'author', 'source', 'tags', 'notes', 'createdAt']));
  check('The device stores only author and source for the session', JSON.stringify(await stored()) === JSON.stringify(['{"author":"Isaac Asimov","source":"Segregationist"}']), JSON.stringify(await stored()));

  // Reload the page (as Android may do when the camera app returns), then a third photograph.
  await b.goto(APP);
  await waitFor(`!!document.querySelector('.app-header')`, 20000, 'app header after reload');
  await ev(HELPERS);
  await ev(`[...document.querySelectorAll('button')].find((x) => x.textContent.includes('SmartScan')).click()`);
  await waitFor(`!!document.querySelector('.ss-source')`);
  const card = () => ev(`document.querySelector('.ss-reading').textContent`);
  check('After a page reload, the photo screen still shows the reading session', (await card()).includes('Segregationist') && (await card()).includes('Isaac Asimov'), await card());
  await h(`loadSample('clean')`);
  await waitFor(`window.__h.status() === 'Tap the first word of a passage.'`, 120000, 'OCR on third photograph');
  check('Third photograph: reading session still in the top bar', (await readingLine()).endsWith('Segregationist · Isaac Asimov'), await readingLine());
  const w3p = await h(`wordScreen(${A}, 3024)`);
  await pinch(w3p.x, w3p.y, 80, 240);
  await tapWord(A, 3024);
  await tapWord(A + 5, 3024);
  await panelBtn('Add Quote');
  await waitFor(`!!document.querySelector('.ssw-sheet')`);
  check('Third photograph: draft prefilled from the session', (await draftAS()) === 'Isaac Asimov|Segregationist', await draftAS());
  await sheetBtn('Back to photo');
  await sheetGone();

  // New Story.
  await click('.ssw-reading');
  await waitFor(`!!document.querySelector('#ssw-reading-title')`);
  await sheetBtn('New Story');
  await delay(150);
  check('New Story empties the form and says the previous values were cleared', (await ev(`[...document.querySelectorAll('.ssw-sheet .ss-reading-form input')].map((i) => i.value).join('|')`)) === '|' && (await ev(`document.querySelector('.ssw-sheet .ss-reading-form').textContent.includes('New story started')`)));
  await sheetBtn('Close');
  await sheetGone();
  check('New Story clears the session in the top bar and on the device', (await readingLine()).endsWith('Set author & source') && (await stored()).length === 0, `${await readingLine()} | stored: ${JSON.stringify(await stored())}`);
  await panelBtn('Add Quote');
  await waitFor(`!!document.querySelector('.ssw-sheet')`);
  check('After New Story, the next draft has no author or source', (await draftAS()) === '|', await draftAS());
  await sheetBtn('Save');
  await sheetGone();
  const blank = await lastWrite();
  check('Quote after New Story is saved without the previous author or source', blank.author === '' && blank.source === '' && (await readingLine()).endsWith('Set author & source'), JSON.stringify([blank.author, blank.source]));

  // The same controls on the photo screen.
  await click('.ssw-topbar button[aria-label="Close photo"]');
  await waitFor(`!document.querySelector('.ss-workspace') && !!document.querySelector('.ss-source')`);
  const cardBtn = (label) => ev(`[...document.querySelectorAll('.ss-reading button')].find((x) => x.textContent.trim() === '${label}').click()`);
  await cardBtn('Set');
  await h(`setField('.ss-reading .ss-reading-form input', 'Ted Chiang', 0)`);
  await h(`setField('.ss-reading .ss-reading-form input', 'Exhalation', 1)`);
  await cardBtn('Save');
  check('Photo screen: the session can be set before taking a photo', (await card()).includes('Exhalation') && (await card()).includes('Ted Chiang'), await card());
  await cardBtn('New Story');
  check('Photo screen: New Story clears it', !(await card()).includes('Exhalation') && (await stored()).length === 0, await card());
  const src = await ev(`(() => { const c = document.querySelector('.smartscan').getBoundingClientRect(); const u = [...document.querySelectorAll('.ss-source button')].map((x) => x.getBoundingClientRect().bottom); return { top: Math.round(c.top), lastButton: Math.round(Math.max(...u)), scroll: document.documentElement.scrollHeight > innerHeight }; })()`);
  check('Photo screen: card starts at the top (no empty band) and both photo buttons are visible without scrolling', src.top <= 24 && src.lastButton <= 844 && !src.scroll, JSON.stringify(src));

  await click('.ss-back-button');
  await waitFor(`!!document.querySelector('.app-header')`);

  // ---- OCR Lab retired ---------------------------------------------------------
  // The test server still sets the old VITE_SMARTSCAN_LAB_UIDS allowlist for the
  // signed-in mock user, to prove the variable no longer does anything.
  check('OCR Lab button is gone from the header', !(await ev(`[...document.querySelectorAll('button')].some((x) => x.textContent.includes('OCR Lab'))`)));
  await ev(`location.hash = '#ocr-lab'`);
  await delay(400);
  check('The old #ocr-lab address shows the normal app', await ev(`!!document.querySelector('.quote-form') && !document.querySelector('.ocr-lab')`));
  check('No OCR Lab code was requested', !b.requests.some((u) => /OcrLab|\/lab\//.test(u)));
  // The model itself is fetched inside the OCR worker, which this page-level
  // network log can't see, so ask the server directly.
  const model = await ev(`fetch('/ocr/models/best_int/eng.traineddata.gz').then(async (r) => ({ ok: r.ok, bytes: (await r.arrayBuffer()).byteLength }))`);
  check('SmartScan’s OCR model (best_int) is served by the app', model.ok && model.bytes > 1_000_000, `${(model.bytes / 1048576).toFixed(1)} MB`);
  const fast = await ev(`fetch('/ocr/models/fast/eng.traineddata.gz').then(async (r) => ({ status: r.status, type: r.headers.get('content-type') || '', bytes: (await r.arrayBuffer()).byteLength }))`);
  check('The Lab-only "fast" model is no longer shipped', fast.status === 404 || /html/.test(fast.type) || fast.bytes < 100_000, JSON.stringify(fast));

  // ---- Hygiene ----------------------------------------------------------------
  const firebaseHosts = b.requests.filter((u) => /firestore\.googleapis|identitytoolkit|securetoken|firebaseio|firebaseapp|googleapis\.com\/(?!css)/.test(u));
  check('No request reached a real Firebase / Google API (mocked)', firebaseHosts.length === 0, firebaseHosts.slice(0, 3).join(' '));
  const offOrigin = [...new Set(b.requests.filter((u) => !u.startsWith(APP) && !u.startsWith('blob:') && !u.startsWith('data:')).map((u) => new URL(u).host))];
  check('No requests leave the app origin (except the existing Google Fonts CSS)', offOrigin.every((hst) => /fonts\.(googleapis|gstatic)\.com/.test(hst)), offOrigin.join(', ') || 'none');
  const errs = b.errors.filter((e) => !/Download the React DevTools/.test(e) && !/SmartScan save failed: Error: mock offline/.test(e)); // the deliberate failed-save test
  check('No page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
} catch (err) {
  check('Harness completed', false, err.stack);
} finally {
  await b.close();
  await server.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

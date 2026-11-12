// SmartScan Sprint 2A-0 OCR benchmark (dev-only page; not part of the app build).
// Everything runs on this device: photos are read from memory, never uploaded,
// and exported results contain numbers only (no images, no recognized text).

import { createWorker } from 'tesseract.js';
import { boxMetrics, errorRates } from './metrics.js';
import { SAMPLE_SPECS, renderSample } from './samples.js';

const abs = (p) => new URL(p, location.href).href;
const TESSERACT_VERSION = '7.0.0';

// Self-hosted assets (served by the Vite dev server, never by a third-party CDN).
// Optional ?core=lstm|simd-lstm|relaxedsimd-lstm forces one engine build (diagnostics).
const CORE_BUILDS = ['lstm', 'simd-lstm', 'relaxedsimd-lstm'];
const coreParam = new URLSearchParams(location.search).get('core');
const CORE_OVERRIDE = CORE_BUILDS.includes(coreParam) ? coreParam : null;

const ASSETS = {
  workerPath: abs('./vendor/worker.min.js'),
  corePath: CORE_OVERRIDE ? abs(`./vendor/core/tesseract-core-${CORE_OVERRIDE}.wasm.js`) : abs('./vendor/core'),
};

// Same SIMD probe Tesseract.js uses (wasm-feature-detect) to pick its core build.
const SIMD_PROBE = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);
const simd = async () => {
  try {
    return WebAssembly.validate(SIMD_PROBE);
  } catch {
    return false;
  }
};
const MODELS = {
  fast: { label: 'fast (tessdata_fast)', langPath: abs('./models/fast') },
  best_int: { label: 'best_int (Tesseract.js default)', langPath: abs('./models/best_int') },
  best: { label: 'best (tessdata_best float)', langPath: abs('./models/best') },
};

const STORE_RESULTS = 'ocrbench.results.v1';
const STORE_PENDING = 'ocrbench.pending.v1';

const $ = (sel) => document.querySelector(sel);
const store = {
  get(key) {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable: results stay in memory */
    }
  },
};

const state = {
  samples: [], // { id, label, kind, file, width?, height?, gtText?, gtWords?, tags[] }
  results: store.get(STORE_RESULTS) || [],
  running: false,
  stopRequested: false,
};

const round = (x, d = 0) => (x === null || x === undefined || Number.isNaN(x) ? null : Number(x.toFixed(d)));
const pct = (x) => (x === null || x === undefined ? '—' : `${(x * 100).toFixed(1)}%`);
const heapMB = () => (performance.memory ? round(performance.memory.usedJSHeapSize / 1048576, 1) : null);

function log(msg) {
  const el = $('#log');
  el.textContent += `${new Date().toLocaleTimeString()}  ${msg}\n`;
  el.scrollTop = el.scrollHeight;
}

// ---- Device info ------------------------------------------------------------

async function deviceInfo() {
  return {
    userAgent: navigator.userAgent,
    platform: navigator.userAgentData?.platform || navigator.platform,
    mobile: navigator.userAgentData?.mobile ?? /Mobi|Android/i.test(navigator.userAgent),
    cores: navigator.hardwareConcurrency || null,
    deviceMemoryGB: navigator.deviceMemory || null,
    jsHeapLimitMB: performance.memory ? round(performance.memory.jsHeapSizeLimit / 1048576) : null,
    wasmSimd: await simd(),
    screen: `${screen.width}x${screen.height}@${window.devicePixelRatio}`,
    tesseract: TESSERACT_VERSION,
    core: CORE_OVERRIDE || 'auto',
  };
}

// ---- Download check ---------------------------------------------------------

// Download size is the same (±0.1%) for the simd / relaxed-simd variants.
async function coreFileName() {
  return (await simd()) ? 'tesseract-core-simd-lstm.wasm.js' : 'tesseract-core-lstm.wasm.js';
}

async function downloadCheck() {
  const files = [
    ['worker', ASSETS.workerPath],
    ['core', `${ASSETS.corePath}/${await coreFileName()}`],
    ...Object.entries(MODELS).map(([id, m]) => [`model:${id}`, `${m.langPath}/eng.traineddata.gz`]),
  ];
  const rows = [];
  for (const [name, url] of files) {
    const t0 = performance.now();
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bytes = (await res.arrayBuffer()).byteLength;
      const ms = round(performance.now() - t0);
      const timing = performance.getEntriesByName(url).pop();
      const wire = timing?.encodedBodySize || bytes;
      rows.push({ name, file: url.split('/').pop(), bytes, wireBytes: wire, mb: round(wire / 1048576, 2), ms });
    } catch (err) {
      rows.push({ name, file: url.split('/').pop(), error: String(err.message || err) });
    }
  }
  return rows;
}

// ---- Samples ----------------------------------------------------------------

async function generateSynthetic() {
  state.samples = state.samples.filter((s) => s.kind !== 'synthetic');
  for (const spec of SAMPLE_SPECS) {
    log(`Rendering synthetic page: ${spec.label}`);
    state.samples.push(await renderSample(spec));
  }
  renderSampleList();
}

function addPhotos(files) {
  const existing = state.samples.filter((s) => s.kind === 'photo').length;
  [...files].forEach((file, i) => {
    state.samples.push({ id: `photo-${existing + i + 1}`, label: `Photo ${existing + i + 1}`, kind: 'photo', file, gtText: '', tags: [] });
  });
  renderSampleList();
}

const PHOTO_TAGS = [
  ['underline', 'Pencil underline'],
  ['curved', 'Curved page'],
  ['small', 'Small text'],
  ['lowlight', 'Low / uneven light'],
];

function renderSampleList() {
  const list = $('#samples');
  list.replaceChildren();
  for (const s of state.samples) {
    const li = document.createElement('li');
    li.className = 'sample';
    const title = document.createElement('div');
    title.className = 'sample-title';
    title.textContent = `${s.label}${s.kind === 'synthetic' ? ' (synthetic, auto ground truth)' : ` · ${(s.file.size / 1048576).toFixed(1)} MB`}`;
    li.append(title);

    if (s.kind === 'photo') {
      const tags = document.createElement('div');
      tags.className = 'tags';
      for (const [value, text] of PHOTO_TAGS) {
        const label = document.createElement('label');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = s.tags.includes(value);
        cb.addEventListener('change', () => {
          s.tags = cb.checked ? [...s.tags, value] : s.tags.filter((t) => t !== value);
        });
        label.append(cb, ` ${text}`);
        tags.append(label);
      }
      const gt = document.createElement('textarea');
      gt.rows = 3;
      gt.placeholder = 'Optional: type the exact text of the underlined passage(s) to measure accuracy.';
      gt.value = s.gtText;
      gt.setAttribute('aria-label', `Ground truth for ${s.label}`);
      gt.addEventListener('input', () => {
        s.gtText = gt.value;
      });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Remove';
      remove.addEventListener('click', () => {
        state.samples = state.samples.filter((x) => x !== s);
        renderSampleList();
      });
      li.append(tags, gt, remove);
    }
    list.append(li);
  }
  $('#sample-count').textContent = `${state.samples.length} sample(s)`;
}

// ---- OCR run ----------------------------------------------------------------

function flattenWords(blocks) {
  const words = [];
  for (const b of blocks || []) for (const p of b.paragraphs) for (const l of p.lines) for (const w of l.words) words.push(w);
  return words;
}

async function prepareInput(bitmap, size) {
  const long = Math.max(bitmap.width, bitmap.height);
  const scale = Math.min(1, size / long); // never upscale
  const tw = Math.round(bitmap.width * scale);
  const th = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, tw, th);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  canvas.width = canvas.height = 0; // release pixels early
  return { blob, tw, th, sx: bitmap.width / tw, sy: bitmap.height / th };
}

function persist() {
  store.set(STORE_RESULTS, state.results);
  renderResults();
}

async function runBenchmark({ models, sizes, sampleIds } = {}) {
  if (state.running) return state.results;
  models = models || [...document.querySelectorAll('input[name=model]:checked')].map((x) => x.value);
  sizes = sizes || [...document.querySelectorAll('input[name=size]:checked')].map((x) => Number(x.value));
  const samples = sampleIds ? state.samples.filter((s) => sampleIds.includes(s.id)) : state.samples;
  if (!models.length || !sizes.length || !samples.length) {
    log('Select at least one model, one size, and one sample.');
    return state.results;
  }

  state.running = true;
  state.stopRequested = false;
  $('#run').disabled = true;
  $('#stop').disabled = false;
  const device = await deviceInfo();
  const session = new Date().toISOString();

  try {
    for (const modelId of models) {
      if (state.stopRequested) break;
      store.set(STORE_PENDING, { session, stage: 'init', model: modelId, at: Date.now() });
      log(`Loading ${modelId} (cold: cache disabled)…`);
      const t0 = performance.now();
      let worker;
      try {
        worker = await createWorker('eng', 1, {
          ...ASSETS,
          langPath: MODELS[modelId].langPath,
          cacheMethod: 'none', // measure first-use load every time
          gzip: true,
        });
      } catch (err) {
        log(`✗ ${modelId} failed to load: ${err.message || err}`);
        state.results.push({ session, device, model: modelId, error: `init: ${err.message || err}` });
        persist();
        continue;
      }
      const initMs = round(performance.now() - t0);
      log(`  ${modelId} ready in ${initMs} ms`);

      for (const sample of samples) {
        if (state.stopRequested) break;
        let bitmap;
        try {
          const td = performance.now();
          bitmap = await createImageBitmap(sample.file, { imageOrientation: 'from-image' });
          const decodeMs = round(performance.now() - td);

          for (const size of sizes) {
            if (state.stopRequested) break;
            store.set(STORE_PENDING, { session, stage: 'recognize', model: modelId, sample: sample.id, size, at: Date.now() });
            const row = {
              session,
              device,
              sample: sample.id,
              kind: sample.kind,
              tags: sample.tags,
              model: modelId,
              size,
              origW: bitmap.width,
              origH: bitmap.height,
              decodeMs,
              initMs,
            };
            try {
              const tp = performance.now();
              const input = await prepareInput(bitmap, size);
              row.targetW = input.tw;
              row.targetH = input.th;
              row.prepMs = round(performance.now() - tp);

              const tr = performance.now();
              const { data } = await worker.recognize(input.blob, {}, { text: true, blocks: true });
              row.recognizeMs = round(performance.now() - tr);

              // Map word boxes from OCR-input pixels back to original-photo pixels.
              const words = flattenWords(data.blocks).map((w) => ({
                text: w.text,
                confidence: w.confidence,
                bbox: { x0: w.bbox.x0 * input.sx, y0: w.bbox.y0 * input.sy, x1: w.bbox.x1 * input.sx, y1: w.bbox.y1 * input.sy },
              }));
              row.words = words.length;
              row.meanConfidence = round(words.reduce((a, w) => a + w.confidence, 0) / (words.length || 1), 1);
              row.hasLineBaselines = Boolean(data.blocks?.[0]?.paragraphs?.[0]?.lines?.[0]?.baseline);

              const rates = sample.gtText ? errorRates(sample.gtText, data.text) : null;
              if (rates) {
                row.cer = round(rates.cer, 4);
                row.wer = round(rates.wer, 4);
                row.refWords = rates.refWords;
              }
              if (sample.gtWords) {
                const bm = boxMetrics(sample.gtWords, words);
                Object.assign(row, {
                  boxHitRate: round(bm.boxHitRate, 4),
                  centerHitRate: round(bm.centerHitRate, 4),
                  textHitRate: round(bm.textHitRate, 4),
                  medianIou: round(bm.medianIou, 3),
                  medianDx: round(bm.medianDx, 1),
                  medianDy: round(bm.medianDy, 1),
                });
              }
              row.heapMB = heapMB();
              log(`  ${sample.id} @${size}: ${row.recognizeMs} ms, CER ${pct(row.cer)}, boxes ${pct(row.centerHitRate)}`);
            } catch (err) {
              row.error = String(err.message || err);
              log(`  ✗ ${sample.id} @${size}: ${row.error}`);
            }
            state.results.push(row);
            persist();
          }
        } catch (err) {
          state.results.push({ session, device, sample: sample.id, model: modelId, error: `decode: ${err.message || err}` });
          log(`  ✗ ${sample.id} decode failed: ${err.message || err}`);
          persist();
        } finally {
          bitmap?.close();
        }
      }
      await worker.terminate();
    }
  } finally {
    store.set(STORE_PENDING, null);
    state.running = false;
    $('#run').disabled = false;
    $('#stop').disabled = true;
    log(state.stopRequested ? 'Stopped.' : 'Benchmark complete.');
  }
  return state.results;
}

// ---- Results ------------------------------------------------------------------

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const med = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function summarize(results) {
  const ok = results.filter((r) => !r.error && r.size);
  const groups = new Map();
  for (const r of ok) {
    const key = `${r.model}|${r.size}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  return [...groups.entries()].map(([key, rs]) => {
    const [model, size] = key.split('|');
    const pick = (f) => rs.map((r) => r[f]).filter((v) => v !== null && v !== undefined);
    return {
      model,
      size: Number(size),
      runs: rs.length,
      medianRecognizeMs: round(med(pick('recognizeMs'))),
      maxRecognizeMs: round(Math.max(...pick('recognizeMs'))),
      medianCer: round(med(pick('cer')), 4),
      medianWer: round(med(pick('wer')), 4),
      meanCenterHit: round(mean(pick('centerHitRate')), 4),
      meanBoxHit: round(mean(pick('boxHitRate')), 4),
      initMs: round(med(pick('initMs'))),
    };
  });
}

function renderResults() {
  const tbody = $('#summary tbody');
  tbody.replaceChildren();
  for (const s of summarize(state.results)) {
    const tr = document.createElement('tr');
    for (const v of [s.model, s.size, s.runs, s.medianRecognizeMs, pct(s.medianCer), pct(s.medianWer), pct(s.meanCenterHit), s.initMs]) {
      const td = document.createElement('td');
      td.textContent = v ?? '—';
      tr.append(td);
    }
    tbody.append(tr);
  }
  $('#result-count').textContent = `${state.results.length} run(s) recorded`;
}

function exportJson() {
  return JSON.stringify({ benchmark: 'smartscan-2a0-ocr', exportedAt: new Date().toISOString(), results: state.results, summary: summarize(state.results) }, null, 1);
}

// ---- Wire up ------------------------------------------------------------------

function init() {
  const pending = store.get(STORE_PENDING);
  if (pending) {
    const note = `Previous session did not finish: stopped during ${pending.stage} (model ${pending.model}${pending.sample ? `, ${pending.sample} @${pending.size}px` : ''}). This usually means the tab ran out of memory.`;
    $('#crash').textContent = note;
    $('#crash').hidden = false;
    state.results.push({ session: pending.session, model: pending.model, sample: pending.sample, size: pending.size, error: 'tab crashed or was closed during run (likely memory)' });
    store.set(STORE_PENDING, null);
    persist();
  }

  deviceInfo().then((d) => {
    $('#device').textContent = `${d.mobile ? 'Mobile' : 'Desktop'} · ${d.cores ?? '?'} cores · ${d.deviceMemoryGB ?? '?'} GB · SIMD ${d.wasmSimd ? 'yes' : 'no'} · Tesseract.js ${d.tesseract}`;
  });

  $('#gen').addEventListener('click', async (e) => {
    e.target.disabled = true;
    await generateSynthetic();
    e.target.disabled = false;
  });
  $('#photos').addEventListener('change', (e) => {
    addPhotos(e.target.files);
    e.target.value = '';
  });
  $('#dl').addEventListener('click', async (e) => {
    e.target.disabled = true;
    log('Download check (cache bypassed)…');
    for (const r of await downloadCheck()) log(`  ${r.name}: ${r.error ? `✗ ${r.error}` : `${r.mb} MB in ${r.ms} ms`}`);
    e.target.disabled = false;
  });
  $('#run').addEventListener('click', () => runBenchmark());
  $('#stop').addEventListener('click', () => {
    state.stopRequested = true;
    log('Stopping after the current run…');
  });
  $('#copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(exportJson());
      log('Results copied to clipboard.');
    } catch {
      log('Clipboard unavailable; use Download results.');
    }
  });
  $('#download').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([exportJson()], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `smartscan-ocr-benchmark-${Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $('#clear').addEventListener('click', () => {
    state.results = [];
    persist();
    log('Results cleared.');
  });

  renderSampleList();
  renderResults();
}

init();

// Hook for automated desktop runs (Playwright).
window.__bench = { generateSynthetic, runBenchmark, downloadCheck, deviceInfo, summarize, state, exportJson };

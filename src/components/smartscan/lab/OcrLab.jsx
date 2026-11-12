// SmartScan OCR Lab: temporary, access-controlled Sprint 2A-0 test view.
// Runs OCR entirely on this device. No Firestore access, no uploads.
// Exported results contain numbers only (no images, filenames, or text).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ACCEPTED_EXTENSIONS, ACCEPTED_IMAGE_TYPES, formatBytes } from '../imageUtils';
import { errorRates } from '../ocr/metrics';
import {
  DEFAULT_OCR,
  OCR_MODELS,
  OCR_SIZES,
  createOcrWorker,
  decodePhoto,
  prepareOcrInput,
  recognizePhoto,
  wasmSimdSupported,
  wordAt,
} from '../ocr/ocrEngine';
import './ocrLab.css';

const MAX_LAB_BYTES = 60 * 1024 * 1024; // allow 50 MP phone photos for memory testing
const LOW_CONFIDENCE = 70;
const PENDING_KEY = 'smartscan.ocrlab.pending.v1';
const LAB_VERSION = '2a0-live-1';

const storage = {
  get(key) {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      if (value == null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable */
    }
  },
};

const ms = (v) => (v == null ? '—' : v >= 10000 ? `${(v / 1000).toFixed(1)} s` : `${Math.round(v)} ms`);
const pct = (v) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`);

function deviceSummary() {
  return {
    userAgent: navigator.userAgent,
    mobile: navigator.userAgentData?.mobile ?? /Mobi|Android/i.test(navigator.userAgent),
    cores: navigator.hardwareConcurrency || null,
    deviceMemoryGB: navigator.deviceMemory || null,
    wasmSimd: wasmSimdSupported(),
    screen: `${window.screen.width}x${window.screen.height}@${window.devicePixelRatio}`,
    standalonePwa: window.matchMedia?.('(display-mode: standalone)').matches ?? false,
  };
}

function isAcceptedImage(file) {
  if (file.type) return ACCEPTED_IMAGE_TYPES.includes(file.type);
  const name = (file.name || '').toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export default function OcrLab({ onExit }) {
  const device = useMemo(deviceSummary, []);
  const [photo, setPhoto] = useState(null); // { id, url, width, height, bytes, type, source, decodeMs }
  const bitmapRef = useRef(null);
  const photoCount = useRef(0);

  const [model, setModel] = useState(DEFAULT_OCR.model);
  const [size, setSize] = useState(DEFAULT_OCR.size);
  const [useCache, setUseCache] = useState(false);
  const [groundTruth, setGroundTruth] = useState('');
  const [showBoxes, setShowBoxes] = useState(true);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [notice, setNotice] = useState(null);
  const [crash] = useState(() => storage.get(PENDING_KEY));
  const [runs, setRuns] = useState([]); // metrics only
  const [active, setActive] = useState(null); // { runId, text, words, width, height }
  const [tapped, setTapped] = useState(null);

  const workerRef = useRef(null);
  const runIdRef = useRef(0);
  const stopRef = useRef(false);
  const uploadRef = useRef(null);
  const cameraRef = useRef(null);

  // Clear a stale crash marker once it has been shown.
  useEffect(() => {
    if (crash) storage.set(PENDING_KEY, null);
  }, [crash]);

  // Release the preview URL when the photo changes or the lab closes.
  useEffect(() => {
    if (!photo) return undefined;
    return () => URL.revokeObjectURL(photo.url);
  }, [photo]);

  // Free the decoded bitmap and any running worker when leaving the lab.
  useEffect(
    () => () => {
      stopRef.current = true;
      bitmapRef.current?.close();
      bitmapRef.current = null;
      workerRef.current?.terminate();
      workerRef.current = null;
      storage.set(PENDING_KEY, null);
    },
    [],
  );

  const handleFile = useCallback(async (file, source) => {
    setNotice(null);
    if (!isAcceptedImage(file)) {
      setNotice({ kind: 'error', text: 'Unsupported file type. Choose a JPEG, PNG, or WebP photo.' });
      return;
    }
    if (file.size > MAX_LAB_BYTES) {
      setNotice({ kind: 'error', text: `That photo is ${formatBytes(file.size)}; the lab limit is ${formatBytes(MAX_LAB_BYTES)}.` });
      return;
    }
    setNotice({ kind: 'info', text: 'Decoding photo at full resolution…' });
    try {
      const t0 = performance.now();
      const bitmap = await decodePhoto(file);
      const decodeMs = performance.now() - t0;
      bitmapRef.current?.close();
      bitmapRef.current = bitmap;
      photoCount.current += 1;
      setPhoto({
        id: `photo-${photoCount.current}`,
        url: URL.createObjectURL(file),
        width: bitmap.width,
        height: bitmap.height,
        bytes: file.size,
        type: file.type || 'unknown',
        source,
        decodeMs,
      });
      setActive(null);
      setTapped(null);
      setNotice({ kind: 'success', text: `Photo ready: ${bitmap.width}×${bitmap.height}.` });
    } catch (err) {
      setNotice({ kind: 'error', text: `Could not decode this photo (it may be too large for this device's memory): ${err.message || err}` });
    }
  }, []);

  const onPick = (source) => (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) handleFile(file, source);
  };

  const runOcr = useCallback(
    async (combos) => {
      const bitmap = bitmapRef.current;
      if (!bitmap || !photo) return;
      setBusy(true);
      setTapped(null);
      stopRef.current = false;
      setNotice(null);

      const byModel = new Map();
      for (const c of combos) byModel.set(c.model, [...(byModel.get(c.model) || []), c.size]);

      try {
        for (const [modelId, sizes] of byModel) {
          if (stopRef.current) break;
          setProgress(`Loading ${modelId} model…`);
          storage.set(PENDING_KEY, { stage: 'load', model: modelId, photo: `${photo.width}x${photo.height}`, at: Date.now() });
          let loaded;
          try {
            loaded = await createOcrWorker(modelId, {
              cache: useCache,
              onProgress: (m) => {
                if (m.status === 'recognizing text') setProgress(`Recognizing (${modelId}) ${Math.round(m.progress * 100)}%`);
              },
            });
          } catch (err) {
            const runId = ++runIdRef.current;
            setRuns((r) => [...r, { runId, photo: photo.id, model: modelId, error: `load: ${err.message || err}` }]);
            continue;
          }
          workerRef.current = loaded.worker;
          let first = true;

          for (const target of sizes) {
            if (stopRef.current) break;
            storage.set(PENDING_KEY, { stage: 'recognize', model: modelId, size: target, photo: `${photo.width}x${photo.height}`, at: Date.now() });
            const row = {
              photo: photo.id,
              source: photo.source,
              model: modelId,
              size: target,
              origW: photo.width,
              origH: photo.height,
              photoMB: Number((photo.bytes / 1048576).toFixed(2)),
              decodeMs: Math.round(photo.decodeMs),
              loadMs: first ? Math.round(loaded.loadMs) : null,
              cache: useCache,
            };
            try {
              setProgress(`Preparing ${target}px input…`);
              const input = await prepareOcrInput(bitmap, target);
              row.inputW = input.width;
              row.inputH = input.height;
              row.prepMs = Math.round(input.prepMs);
              setProgress(`Recognizing (${modelId} @ ${target}px)…`);
              const result = await recognizePhoto(loaded.worker, input);
              row.recognizeMs = Math.round(result.recognizeMs);
              row.totalMs = Math.round(input.prepMs + result.recognizeMs + (first ? loaded.loadMs : 0));
              row.words = result.words.length;
              row.lines = result.lines;
              row.meanConfidence = Number(result.meanConfidence.toFixed(1));
              row.lowConfidenceWords = result.words.filter((w) => w.confidence < LOW_CONFIDENCE).length;
              const rates = groundTruth.trim() ? errorRates(groundTruth, result.text) : null;
              if (rates) {
                row.cer = Number(rates.cer.toFixed(4));
                row.wer = Number(rates.wer.toFixed(4));
              }
              const runId = ++runIdRef.current;
              setRuns((r) => [...r, { runId, ...row }]);
              setActive({ runId, text: result.text, words: result.words, width: photo.width, height: photo.height, model: modelId, size: target });
            } catch (err) {
              const runId = ++runIdRef.current;
              setRuns((r) => [...r, { runId, ...row, error: String(err.message || err) }]);
            }
            first = false;
          }
          await loaded.worker.terminate();
          workerRef.current = null;
        }
      } finally {
        storage.set(PENDING_KEY, null);
        setBusy(false);
        setProgress('');
        setNotice(stopRef.current ? { kind: 'info', text: 'Stopped.' } : { kind: 'success', text: 'OCR complete.' });
      }
    },
    [photo, useCache, groundTruth],
  );

  const runSingle = () => runOcr([{ model, size }]);
  const runMatrix = () => runOcr(Object.keys(OCR_MODELS).flatMap((m) => OCR_SIZES.map((s) => ({ model: m, size: s }))));

  const activeRates = useMemo(
    () => (active && groundTruth.trim() ? errorRates(groundTruth, active.text) : null),
    [active, groundTruth],
  );

  const onOverlayTap = (e) => {
    if (!active) return;
    const svg = e.currentTarget;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    const hit = wordAt(active.words, p.x, p.y);
    setTapped(hit ? { text: hit.text, confidence: hit.confidence, line: hit.line } : { miss: true });
  };

  const exportJson = () =>
    JSON.stringify(
      { lab: 'smartscan-ocr-lab', version: LAB_VERSION, exportedAt: new Date().toISOString(), device, runs },
      null,
      1,
    );

  const copyResults = async () => {
    try {
      await navigator.clipboard.writeText(exportJson());
      setNotice({ kind: 'success', text: 'Results copied (numbers only, no text or images).' });
    } catch {
      setNotice({ kind: 'error', text: 'Clipboard unavailable. Use Download results.' });
    }
  };

  const downloadResults = () => {
    const url = URL.createObjectURL(new Blob([exportJson()], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `smartscan-ocr-lab-${Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="quote-form-container smartscan ocr-lab">
      <div className="quote-form-header ss-header">
        <h1 className="quote-title">OCR Lab</h1>
        <button type="button" className="ss-back-button" onClick={onExit} aria-label="Back to QuoteKeeper" title="Back to QuoteKeeper">
          <span aria-hidden="true">←</span>
          <span className="ss-back-text">QuoteKeeper</span>
        </button>
      </div>

      <div className="ss-body">
        <p className="ss-hint">
          Test view for SmartScan Sprint 2A-0. OCR runs on this device; photos are never uploaded and nothing is saved
          to QuoteKeeper. {device.mobile ? 'Mobile' : 'Desktop'} · {device.cores ?? '?'} cores ·{' '}
          {device.deviceMemoryGB ?? '?'} GB · SIMD {device.wasmSimd ? 'yes' : 'no'}
          {device.standalonePwa ? ' · installed PWA' : ''}
        </p>

        {crash && (
          <p className="ss-notice ss-notice--error" role="alert">
            The last OCR run did not finish ({crash.stage}, {crash.model}
            {crash.size ? ` @ ${crash.size}px` : ''}, photo {crash.photo}). The tab likely ran out of memory or was closed.
          </p>
        )}

        <div className="ss-messages">
          <div role="status" aria-live="polite">
            {busy && <p className="ss-notice ss-notice--info">{progress || 'Working…'}</p>}
            {!busy && notice && notice.kind !== 'error' && <p className={`ss-notice ss-notice--${notice.kind}`}>{notice.text}</p>}
          </div>
          <div role="alert">{notice?.kind === 'error' && <p className="ss-notice ss-notice--error">{notice.text}</p>}</div>
        </div>

        <section className="lab-section" aria-label="Photo">
          <div className="ss-actions">
            <button type="button" className="ss-btn ss-btn--primary" onClick={() => cameraRef.current?.click()} disabled={busy}>
              <span aria-hidden="true">📷</span> Take Photo
            </button>
            <button type="button" className="ss-btn ss-btn--secondary" onClick={() => uploadRef.current?.click()} disabled={busy}>
              <span aria-hidden="true">🖼️</span> Upload Photo
            </button>
          </div>
          <input ref={cameraRef} className="ss-visually-hidden" type="file" accept="image/*" capture="environment" onChange={onPick('camera')} tabIndex={-1} aria-label="Take a photo with the device camera" />
          <input ref={uploadRef} className="ss-visually-hidden" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={onPick('upload')} tabIndex={-1} aria-label="Upload a photo from this device" />

          {photo && (
            <>
              <p className="ss-hint lab-meta">
                Original {photo.width}×{photo.height} · {formatBytes(photo.bytes)} · {photo.source} · decoded in {ms(photo.decodeMs)}
              </p>
              <figure className="lab-figure">
                <img src={photo.url} alt="Photo selected for OCR" className="lab-image" />
                {active && showBoxes && (
                  <svg
                    className="lab-overlay"
                    viewBox={`0 0 ${active.width} ${active.height}`}
                    preserveAspectRatio="none"
                    onClick={onOverlayTap}
                    role="img"
                    aria-label={`${active.words.length} recognized word boxes. Tap a word to identify it.`}
                  >
                    {active.words.map((w) => (
                      <rect
                        key={w.id}
                        x={w.bbox.x0}
                        y={w.bbox.y0}
                        width={w.bbox.x1 - w.bbox.x0}
                        height={w.bbox.y1 - w.bbox.y0}
                        className={w.confidence < LOW_CONFIDENCE ? 'lab-box lab-box--low' : 'lab-box'}
                      />
                    ))}
                  </svg>
                )}
              </figure>
              {active && (
                <label className="lab-check">
                  <input type="checkbox" checked={showBoxes} onChange={(e) => setShowBoxes(e.target.checked)} /> Show word boxes
                  (orange = confidence below {LOW_CONFIDENCE})
                </label>
              )}
              {tapped && (
                <p className="ss-notice ss-notice--info lab-tapped">
                  {tapped.miss ? 'No word at that spot.' : `Tapped “${tapped.text}” · confidence ${Math.round(tapped.confidence)} · line ${tapped.line + 1}`}
                </p>
              )}
            </>
          )}
        </section>

        <section className="lab-section" aria-label="OCR settings">
          <fieldset className="lab-fieldset">
            <legend>Model</legend>
            {Object.entries(OCR_MODELS).map(([id, m]) => (
              <label key={id} className="lab-choice">
                <input type="radio" name="lab-model" value={id} checked={model === id} onChange={() => setModel(id)} disabled={busy} />
                <span>
                  <strong>{m.label}</strong> <span className="ss-hint">{m.description}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <fieldset className="lab-fieldset">
            <legend>OCR input size (long edge)</legend>
            <div className="lab-inline">
              {OCR_SIZES.map((s) => (
                <label key={s} className="lab-choice">
                  <input type="radio" name="lab-size" value={s} checked={size === s} onChange={() => setSize(s)} disabled={busy} /> {s} px
                </label>
              ))}
            </div>
          </fieldset>
          <label className="lab-check">
            <input type="checkbox" checked={useCache} onChange={(e) => setUseCache(e.target.checked)} disabled={busy} /> Cache model on
            this device (off = measure first-use load)
          </label>
          <label className="lab-field">
            <span>Optional: exact text of the underlined passage (for accuracy; never exported)</span>
            <textarea rows={3} value={groundTruth} onChange={(e) => setGroundTruth(e.target.value)} />
          </label>

          <div className="ss-actions">
            <button type="button" className="ss-btn ss-btn--primary" onClick={runSingle} disabled={!photo || busy}>
              Run OCR
            </button>
            <button type="button" className="ss-btn ss-btn--secondary" onClick={runMatrix} disabled={!photo || busy}>
              Run all 6
            </button>
          </div>
          {busy && (
            <button
              type="button"
              className="ss-btn ss-btn--text"
              onClick={() => {
                stopRef.current = true;
                setProgress('Stopping after the current step…');
              }}
            >
              Stop
            </button>
          )}
        </section>

        {active && (
          <section className="lab-section" aria-label="Recognized text">
            <h2 className="ss-heading">
              Run {active.runId}: {active.model} @ {active.size}px
            </h2>
            {activeRates && (
              <p className="ss-hint">
                Against your passage: CER {pct(activeRates.cer)} · WER {pct(activeRates.wer)}
              </p>
            )}
            <pre className="lab-text" tabIndex={0}>{active.text || '(no text recognized)'}</pre>
          </section>
        )}

        {runs.length > 0 && (
          <section className="lab-section" aria-label="Runs">
            <div className="lab-table-wrap">
              <table className="lab-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Model</th>
                    <th>Input</th>
                    <th>Load</th>
                    <th>OCR</th>
                    <th>Total</th>
                    <th>Words</th>
                    <th>Conf</th>
                    <th>CER</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.runId}>
                      <td>{r.runId}</td>
                      <td>{r.model}</td>
                      {r.error ? (
                        <td colSpan={7} className="lab-error">
                          {r.error}
                        </td>
                      ) : (
                        <>
                          <td>
                            {r.inputW}×{r.inputH}
                          </td>
                          <td>{ms(r.loadMs)}</td>
                          <td>{ms(r.recognizeMs)}</td>
                          <td>{ms(r.totalMs)}</td>
                          <td>{r.words}</td>
                          <td>{r.meanConfidence}</td>
                          <td>{pct(r.cer)}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="ss-actions">
              <button type="button" className="ss-btn ss-btn--secondary" onClick={copyResults}>
                Copy results
              </button>
              <button type="button" className="ss-btn ss-btn--secondary" onClick={downloadResults}>
                Download results
              </button>
            </div>
            <p className="ss-hint">Results contain timings and counts only: no photos, filenames, or recognized text.</p>
          </section>
        )}
      </div>
    </div>
  );
}

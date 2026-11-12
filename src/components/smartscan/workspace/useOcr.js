// Runs on-device OCR for the open photo using the shared engine (ocr/ocrEngine.js),
// with the settings chosen by the Sprint 2A-0 benchmark (benchmark/ocr):
// best_int model at 2000 px on the long edge.
//
// - The worker is created once and reused (model cached on the device after first use).
// - A Tesseract job cannot be interrupted, so rotating mid-run terminates the
//   worker and starts a fresh one rather than waiting for a result we'd discard.
// - The full-resolution bitmap is released as soon as the OCR input is built.

import { useEffect, useRef } from 'react';
import { DEFAULT_OCR, createOcrWorker, decodePhoto, prepareOcrInput, recognizePhoto } from '../ocr/ocrEngine';
import { buildReadingOrder } from '../selection/readingOrder';

export function useOcr(file, rotation, attempt, dispatch) {
  const workerRef = useRef(null); // Promise<Tesseract worker> | null
  const progressRef = useRef(null);

  // Terminate the worker when the workspace closes.
  useEffect(
    () => () => {
      const pending = workerRef.current;
      workerRef.current = null;
      pending?.then((w) => w.terminate()).catch(() => {});
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    let running = true;
    let bitmap = null;
    let lastPct = -1;

    const getWorker = () => {
      if (!workerRef.current) {
        const created = createOcrWorker(DEFAULT_OCR.model, {
          cache: true,
          onProgress: (m) => progressRef.current?.(m),
        }).then((r) => r.worker);
        created.catch(() => {
          if (workerRef.current === created) workerRef.current = null;
        });
        workerRef.current = created;
      }
      return workerRef.current;
    };

    progressRef.current = (m) => {
      if (cancelled) return;
      if (m.status === 'recognizing text') {
        const pct = Math.round(m.progress * 100);
        if (pct !== lastPct) {
          lastPct = pct;
          dispatch({ type: 'OCR_PROGRESS', phase: 'Reading text…', progress: m.progress });
        }
      } else if (/load|initializ/i.test(m.status) && lastPct < 0) {
        dispatch({ type: 'OCR_PROGRESS', phase: 'Loading text recognition…' });
      }
    };

    dispatch({ type: 'OCR_START' });
    (async () => {
      try {
        const workerPromise = getWorker(); // load the model while the photo decodes
        bitmap = await decodePhoto(file);
        if (cancelled) return;
        const input = await prepareOcrInput(bitmap, DEFAULT_OCR.size, rotation);
        bitmap.close();
        bitmap = null;
        if (cancelled) return;
        const worker = await workerPromise;
        if (cancelled) return;
        dispatch({ type: 'OCR_PROGRESS', phase: 'Reading text…' });
        const result = await recognizePhoto(worker, input);
        if (cancelled) return;
        dispatch({ type: 'OCR_SUCCESS', words: buildReadingOrder(result.words) });
      } catch (err) {
        if (cancelled) return;
        console.error('SmartScan OCR failed:', err);
        dispatch({
          type: 'OCR_FAILURE',
          message: 'Text recognition failed on this device. Try again, or use a smaller photo.',
        });
      } finally {
        bitmap?.close();
        running = false;
      }
    })();

    return () => {
      cancelled = true;
      if (running && workerRef.current) {
        // Still busy with a job we no longer need: replace the worker.
        const busy = workerRef.current;
        workerRef.current = null;
        busy.then((w) => w.terminate()).catch(() => {});
      }
    };
  }, [file, rotation, attempt, dispatch]);
}

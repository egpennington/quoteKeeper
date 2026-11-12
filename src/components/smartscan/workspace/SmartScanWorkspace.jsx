// SmartScan full-screen photo workspace.
//
// Photo -> on-device OCR -> two-tap passage selection -> edit draft -> save,
// then straight back to the same photo for the next passage.
//
// Gestures (Pointer Events, so touch, pen, and mouse share one path):
//   tap          select words (tap 1 = first word, tap 2 = last word)
//   drag         pan
//   pinch        zoom around the fingers
//   wheel        zoom (desktop)
// There is deliberately no double-tap zoom: two quick taps on two words are a
// selection. `touch-action: none` on the viewport also stops the browser's own
// double-tap and pinch page zoom from competing with ours.

import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { persistQuote } from '../../../utils/quoteRecord';
import ReadingForm from '../ReadingForm';
import { adoptFromQuote, hasReading, readingLabel } from '../readingSession';
import { joinWords } from '../selection/readingOrder';
import { highlightedRange, hitTest, selectionPhase, selectionRects, unionRect } from '../selection/selection';
import QuoteDraftSheet from './QuoteDraftSheet';
import { useOcr } from './useOcr';
import {
  clampView,
  fitView,
  pinchStep,
  revealRect,
  rotatedSize,
  rotationMatrix,
  scaleLimits,
  screenToPage,
  zoomAt,
} from './viewport';
import { OCR_STATUS, initialWorkspaceState, workspaceReducer } from './workspaceModel';
import './workspace.css';

const TAP_SLOP_PX = 8; // movement beyond this turns a tap into a pan
const TAP_MAX_MS = 600;
const FINGER_PX = 22; // tap allowance around words, in screen pixels
const ZOOM_STEP = 1.6;
// The zoom buttons float over the bottom edge of the photo. The page may be
// dragged this far past its bottom edge so no line is ever stuck under them.
const VIEW_PAD = { bottom: 64 };

export default function SmartScanWorkspace({ image, reading, onReadingChange, onNewStory, onClose, saveQuote }) {
  const [state, dispatch] = useReducer(workspaceReducer, initialWorkspaceState);
  const { rotation, ocr, words, selection, saved, draft, saving, notice } = state;
  const [attempt, setAttempt] = useState(0);
  const [readingOpen, setReadingOpen] = useState(false);
  useOcr(image.file, rotation, attempt, dispatch);

  const page = useMemo(() => rotatedSize(image.width, image.height, rotation), [image, rotation]);

  // ---- Viewport size and view transform -----------------------------------
  const viewportRef = useRef(null);
  const [viewSize, setViewSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState(null);
  const fittedRotation = useRef(null);

  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return undefined;
    const measure = () => setViewSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fit the whole page on open and after rotating; otherwise keep the user's
  // zoom and only re-clamp (e.g. when the selection panel opens).
  useLayoutEffect(() => {
    if (!viewSize.w || !viewSize.h) return;
    if (fittedRotation.current !== rotation) {
      fittedRotation.current = rotation;
      setView(fitView(viewSize.w, viewSize.h, page.width, page.height));
    } else {
      setView((v) => v && clampView(v, viewSize.w, viewSize.h, page.width, page.height, VIEW_PAD));
    }
  }, [viewSize, rotation, page]);

  const clamp = useCallback(
    (v) => clampView(v, viewSize.w, viewSize.h, page.width, page.height, VIEW_PAD),
    [viewSize, page],
  );

  // ---- Selection ------------------------------------------------------------
  const phase = selectionPhase(selection);
  const selRects = useMemo(() => {
    const range = highlightedRange(selection);
    return range ? selectionRects(words, range.start, range.end) : [];
  }, [selection, words]);
  const savedRects = useMemo(() => saved.flatMap((r) => selectionRects(words, r.start, r.end)), [saved, words]);
  const selectedText = useMemo(
    () => (phase === 'selected' ? joinWords(words, selection.start, selection.end) : ''),
    [phase, words, selection],
  );

  // Once a passage is chosen, make sure it's on screen above the panel.
  useLayoutEffect(() => {
    if (phase !== 'selected' || !viewSize.h) return;
    const box = unionRect(selectionRects(words, selection.start, selection.end));
    if (box) setView((v) => v && clamp(revealRect(v, box, viewSize.w, viewSize.h)));
  }, [phase, selection, words, viewSize, clamp]);

  // ---- Gestures -------------------------------------------------------------
  const gesture = useRef({ pointers: new Map(), tap: null, last: null, pinch: null, multi: false });

  const localPoint = (e) => {
    const r = viewportRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const handleTap = (pt) => {
    if (!view || ocr.status !== OCR_STATUS.READY || !words.length) return;
    const p = screenToPage(view, pt.x, pt.y);
    const index = hitTest(words, p.x, p.y, FINGER_PX / view.scale);
    if (index != null) dispatch({ type: 'TAP', index });
  };

  const pinchMetrics = (pointers) => {
    const [a, b] = [...pointers.values()];
    return { dist: Math.max(10, Math.hypot(b.x - a.x, b.y - a.y)), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };

  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // Buttons floating over the photo (zoom, retry) handle their own clicks;
    // capturing their pointer here would swallow the click.
    if (e.target.closest('button')) return;
    const g = gesture.current;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const pt = localPoint(e);
    g.pointers.set(e.pointerId, pt);
    if (g.pointers.size === 1) {
      g.multi = false;
      g.tap = { ...pt, t: e.timeStamp, moved: false };
      g.last = pt;
      g.pinch = null;
    } else {
      g.multi = true;
      g.tap = null;
      g.pinch = g.pointers.size === 2 && view ? { from: pinchMetrics(g.pointers), view } : null;
    }
  };

  const onPointerMove = (e) => {
    const g = gesture.current;
    if (!g.pointers.has(e.pointerId) || !view) return;
    const pt = localPoint(e);
    g.pointers.set(e.pointerId, pt);

    // Each frame is computed from the view when the pinch began and clamped once,
    // so edge clamping in early frames can't push the page out from under the fingers.
    if (g.pointers.size === 2 && g.pinch) {
      const { from, view: startView } = g.pinch;
      setView(clamp(pinchStep(startView, from, pinchMetrics(g.pointers))));
      return;
    }

    if (g.pointers.size === 1) {
      if (g.tap && !g.tap.moved && Math.hypot(pt.x - g.tap.x, pt.y - g.tap.y) > TAP_SLOP_PX) g.tap.moved = true;
      if ((!g.tap || g.tap.moved) && g.last) {
        const dx = pt.x - g.last.x;
        const dy = pt.y - g.last.y;
        setView((v) => clamp({ ...v, tx: v.tx + dx, ty: v.ty + dy }));
      }
      g.last = pt;
    }
  };

  const onPointerEnd = (e) => {
    const g = gesture.current;
    if (!g.pointers.has(e.pointerId)) return;
    g.pointers.delete(e.pointerId);
    const tap = g.tap;
    if (g.pointers.size === 0) {
      if (e.type === 'pointerup' && tap && !tap.moved && !g.multi && e.timeStamp - tap.t < TAP_MAX_MS) handleTap(tap);
      g.tap = null;
      g.last = null;
      g.pinch = null;
    } else {
      // A finger lifted mid-pinch: the remaining finger pans from where it is now.
      g.pinch = g.pointers.size === 2 && view ? { from: pinchMetrics(g.pointers), view } : null;
      g.last = g.pointers.size === 1 ? [...g.pointers.values()][0] : null;
    }
  };

  // Desktop wheel / trackpad pinch. Non-passive so ctrl+wheel doesn't zoom the page.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0025));
      setView((v) => v && clamp(zoomAt(v, v.scale * factor, e.clientX - r.left, e.clientY - r.top)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [clamp]);

  const zoomBy = (factor) =>
    setView((v) => v && clamp(zoomAt(v, v.scale * factor, viewSize.w / 2, viewSize.h / 2)));
  const zoomFit = () => setView(fitView(viewSize.w, viewSize.h, page.width, page.height));
  const limits = scaleLimits(viewSize.w, viewSize.h, page.width, page.height);
  const atMin = !view || view.scale <= limits.min * 1.001;
  const atMax = !view || view.scale >= limits.max * 0.999;

  // ---- Actions --------------------------------------------------------------
  const copySelection = async () => {
    try {
      await navigator.clipboard.writeText(selectedText);
      dispatch({ type: 'NOTICE', notice: { kind: 'success', text: 'Copied to clipboard.' } });
    } catch {
      dispatch({ type: 'NOTICE', notice: { kind: 'error', text: 'Copy is not available here. Use Add Quote instead.' } });
    }
  };

  const save = async () => {
    dispatch({ type: 'SAVE_START' });
    try {
      const saved = await persistQuote(draft, saveQuote);
      dispatch({ type: 'SAVE_SUCCESS' });
      // The session learns author/source from this quote only where it had none.
      onReadingChange(adoptFromQuote(reading, saved));
    } catch (err) {
      console.error('SmartScan save failed:', err);
      dispatch({ type: 'SAVE_FAILURE', message: 'The quote could not be saved. Check your connection and try again.' });
    }
  };

  const editDraft = useCallback((field, value) => dispatch({ type: 'EDIT_DRAFT', field, value }), []);
  const cancelDraft = useCallback(() => dispatch({ type: 'CANCEL_DRAFT' }), []);

  // Clear transient notices after a moment.
  useEffect(() => {
    if (!notice || notice.kind === 'error' || draft) return undefined;
    const id = setTimeout(() => dispatch({ type: 'NOTICE', notice: null }), 3500);
    return () => clearTimeout(id);
  }, [notice, draft]);

  // ---- Render ---------------------------------------------------------------
  let status;
  if (ocr.status === OCR_STATUS.RUNNING) status = ocr.phase || 'Reading text…';
  else if (ocr.status === OCR_STATUS.ERROR) status = 'Text recognition failed.';
  else if (ocr.status === OCR_STATUS.READY && !words.length) status = 'No text found.';
  else if (phase === 'anchored') status = 'Now tap the last word.';
  else if (phase === 'selected') status = 'Passage selected.';
  else status = 'Tap the first word of a passage.';

  const imgMatrix = view ? rotationMatrix(rotation, image.width * view.scale, image.height * view.scale) : null;
  const anchorWord = phase === 'anchored' ? words[selection.anchor] : null;
  const sessionLabel = readingLabel(reading);

  return (
    <section className="ss-workspace" aria-label="SmartScan photo">
      <div className="ssw-topbar">
        <button type="button" className="ssw-icon-btn" onClick={onClose} aria-label="Close photo" title="Close photo">
          <span aria-hidden="true">←</span>
        </button>
        <div className="ssw-center">
          <p className="ssw-status" role="status" aria-live="polite">
            {status}
          </p>
          {/* Its ::before covers the whole centre block, giving a full-height tap target. */}
          <button
            type="button"
            className="ssw-reading"
            onClick={() => setReadingOpen(true)}
            aria-label={
              sessionLabel
                ? `Reading: ${sessionLabel}. Change author and source, or start a new story.`
                : 'Set the author and source for this reading session.'
            }
          >
            <span aria-hidden="true">📖 </span>
            {sessionLabel || 'Set author & source'}
          </button>
        </div>
        <button
          type="button"
          className="ssw-icon-btn"
          onClick={() => dispatch({ type: 'ROTATE' })}
          aria-label="Rotate photo 90 degrees clockwise"
          title="Rotate"
        >
          <span aria-hidden="true">⟳</span>
        </button>
      </div>

      <div
        ref={viewportRef}
        className="ssw-viewport"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onContextMenu={(e) => e.preventDefault()}
        data-ocr={ocr.status}
      >
        {view && (
          <div
            className="ssw-page"
            style={{
              width: page.width * view.scale,
              height: page.height * view.scale,
              transform: `translate3d(${view.tx}px, ${view.ty}px, 0)`,
            }}
          >
            <img
              className="ssw-photo"
              src={image.url}
              alt="Book page photo. Tap the first and last words of a passage to select it."
              draggable={false}
              style={{
                width: image.width * view.scale,
                height: image.height * view.scale,
                transform: `matrix(${imgMatrix.join(',')})`,
              }}
            />
            <svg
              className="ssw-overlay"
              viewBox={`0 0 ${page.width} ${page.height}`}
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {savedRects.map((r, i) => (
                <rect key={`s${i}`} className="ssw-saved" x={r.x0} y={r.y0} width={r.x1 - r.x0} height={r.y1 - r.y0} />
              ))}
              {selRects.map((r) => (
                <rect
                  key={`r${r.line}`}
                  className={phase === 'anchored' ? 'ssw-anchor' : 'ssw-sel'}
                  x={r.x0}
                  y={r.y0}
                  width={r.x1 - r.x0}
                  height={r.y1 - r.y0}
                  rx={(r.y1 - r.y0) * 0.15}
                />
              ))}
            </svg>
          </div>
        )}

        {ocr.status === OCR_STATUS.RUNNING && (
          <div className="ssw-progress" aria-hidden="true">
            <span className="ssw-spinner" />
            {ocr.phase || 'Reading text…'}
            {ocr.progress > 0 && ` ${Math.round(ocr.progress * 100)}%`}
          </div>
        )}

        {ocr.status === OCR_STATUS.ERROR && (
          <div className="ssw-progress ssw-progress--error" role="alert">
            {ocr.message}
            <button type="button" className="ss-btn ss-btn--secondary ssw-retry" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </button>
          </div>
        )}

        {notice && !draft && (
          <p className={`ssw-toast ss-notice ss-notice--${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>
            {notice.text}
          </p>
        )}

        <div className="ssw-zoom" role="group" aria-label="Zoom">
          <button type="button" className="ssw-icon-btn" onClick={() => zoomBy(1 / ZOOM_STEP)} disabled={atMin} aria-label="Zoom out">
            <span aria-hidden="true">−</span>
          </button>
          <button type="button" className="ssw-icon-btn" onClick={() => zoomBy(ZOOM_STEP)} disabled={atMax} aria-label="Zoom in">
            <span aria-hidden="true">+</span>
          </button>
          <button type="button" className="ssw-icon-btn" onClick={zoomFit} disabled={atMin} aria-label="Fit whole page">
            <span aria-hidden="true">⤢</span>
          </button>
        </div>
      </div>

      {phase !== 'idle' && (
        <div className="ssw-panel" aria-label="Selected passage">
          {phase === 'anchored' ? (
            <p className="ssw-panel-hint">
              Starting at <strong>“{anchorWord?.text}”</strong>. Tap the last word of the passage (it can be on another
              line).
            </p>
          ) : (
            <p className="ssw-panel-text" tabIndex={0}>
              {selectedText}
            </p>
          )}
          <div className="ssw-panel-actions">
            <button
              type="button"
              className="ss-btn ss-btn--secondary ssw-clear"
              onClick={() => dispatch({ type: 'CLEAR_SELECTION' })}
              aria-label="Clear selection"
            >
              <span aria-hidden="true">✕</span>
            </button>
            <button type="button" className="ss-btn ss-btn--secondary" onClick={copySelection} disabled={phase !== 'selected'}>
              Copy
            </button>
            <button
              type="button"
              className="ss-btn ss-btn--primary"
              onClick={() => dispatch({ type: 'OPEN_DRAFT', reading })}
              disabled={phase !== 'selected'}
            >
              Add Quote
            </button>
          </div>
        </div>
      )}

      {draft && (
        <QuoteDraftSheet
          draft={draft}
          fromSession={hasReading(reading)}
          saving={saving}
          notice={notice}
          onChange={editDraft}
          onCancel={cancelDraft}
          onSave={save}
        />
      )}

      {readingOpen && !draft && (
        <div className="ssw-sheet" role="dialog" aria-modal="true" aria-labelledby="ssw-reading-title">
          <div className="ssw-sheet-body ssw-sheet-body--padded">
            <div className="ssw-sheet-head">
              <h2 id="ssw-reading-title" className="ss-heading">
                Reading session
              </h2>
            </div>
            <ReadingForm
              reading={reading}
              onSave={(next) => {
                onReadingChange(next);
                setReadingOpen(false);
              }}
              onNewStory={onNewStory}
              onClose={() => setReadingOpen(false)}
            />
          </div>
        </div>
      )}
    </section>
  );
}

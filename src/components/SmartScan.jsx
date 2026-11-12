import { Suspense, lazy, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../firebase';
import CameraCapture from './smartscan/CameraCapture';
import PhotoSourcePicker from './smartscan/PhotoSourcePicker';
import ReadingCard from './smartscan/ReadingCard';
import { EMPTY_READING, loadReading, normalizeReading, saveReading } from './smartscan/readingSession';
import { STAGES, initialScanState, scanReducer } from './smartscan/scanModel';
import {
  ScanImageError,
  UNSUPPORTED_CAMERA_MESSAGE,
  canUseLiveCamera,
  loadScanImage,
  prefersNativeCamera,
} from './smartscan/imageUtils';
import './smartscan/smartscan.css';

// The workspace pulls in the OCR engine, so it downloads only when a photo is opened.
const SmartScanWorkspace = lazy(() => import('./smartscan/workspace/SmartScanWorkspace'));

// localStorage can be blocked entirely (the property access itself throws);
// the reading-session helpers treat a null storage as "nothing saved".
function deviceStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// Writes one quote to the existing Firestore `quotes` collection (same shape as manual entry).
const saveQuote = (record) => addDoc(collection(db, 'quotes'), record);

const STEP_TEXT = {
  [STAGES.SOURCE]: 'Take or upload a clear, well-lit photo of a book page.',
  [STAGES.CAMERA]: 'Line up the page, then press Capture.',
};

export default function SmartScan({ onBack, userId }) {
  const [state, dispatch] = useReducer(scanReducer, initialScanState);
  const { stage, image, busy, notice } = state;

  // Reading session (author + source for every new quote). Owned here, above the
  // workspace, so it carries across photographs; kept on this device so it also
  // survives the page reloading when the phone's camera app returns.
  const [reading, setReadingState] = useState(() => loadReading(deviceStorage(), userId));
  const setReading = useCallback(
    (next) => {
      const value = normalizeReading(next);
      setReadingState(value);
      saveReading(deviceStorage(), userId, value);
    },
    [userId],
  );
  const startNewStory = useCallback(() => {
    setReading(EMPTY_READING);
    dispatch({ type: 'SET_NOTICE', notice: { kind: 'info', text: 'New story started. Author and source cleared.' } });
  }, [setReading]);

  const nativeCamera = useMemo(() => prefersNativeCamera(), []);

  // Release the preview's object URL whenever the image is replaced or removed,
  // and when SmartScan unmounts.
  useEffect(() => {
    if (!image) return undefined;
    return () => URL.revokeObjectURL(image.url);
  }, [image]);

  // Ignore results from a stale load (newer photo chosen, or SmartScan closed).
  const loadIdRef = useRef(0);
  useEffect(() => () => {
    loadIdRef.current += 1;
  }, []);

  const handleFile = useCallback(async (file, source) => {
    const loadId = ++loadIdRef.current;
    dispatch({ type: 'LOAD_START' });
    try {
      const loaded = await loadScanImage(file, source);
      if (loadId !== loadIdRef.current) {
        URL.revokeObjectURL(loaded.url);
        return;
      }
      dispatch({ type: 'LOAD_SUCCESS', image: loaded });
    } catch (err) {
      if (loadId !== loadIdRef.current) return;
      const message =
        err instanceof ScanImageError ? err.message : 'Something went wrong loading that photo. Please try again.';
      dispatch({ type: 'LOAD_FAILURE', message });
    }
  }, []);

  const openLiveCamera = useCallback(() => {
    if (!canUseLiveCamera()) {
      dispatch({ type: 'SET_NOTICE', notice: { kind: 'error', text: UNSUPPORTED_CAMERA_MESSAGE } });
      return;
    }
    dispatch({ type: 'OPEN_CAMERA' });
  }, []);

  const closeCamera = useCallback(() => dispatch({ type: 'CLOSE_CAMERA' }), []);

  const handleCameraError = useCallback(
    (text) => dispatch({ type: 'CLOSE_CAMERA', notice: { kind: 'error', text } }),
    [],
  );

  // LOAD_START leaves the camera stage, which unmounts CameraCapture.
  const handleCapture = useCallback((file) => handleFile(file, 'camera'), [handleFile]);

  const replacing = stage === STAGES.SOURCE && Boolean(image);

  return (
    <div className="quote-form-container smartscan">
      <div className="quote-form-header ss-header">
        <img className="quote-icon" src="/logo.png" alt="QuoteKeeper logo" />
        <h1 className="quote-title">SmartScan</h1>
        <button
          type="button"
          className="ss-back-button"
          onClick={onBack}
          aria-label="Back to QuoteKeeper"
          title="Back to QuoteKeeper"
        >
          <span aria-hidden="true">←</span>
          <span className="ss-back-text">QuoteKeeper</span>
        </button>
      </div>

      <div className="ss-body">
        <div className="ss-intro">
          <h2 className="ss-heading">Scan a Quote</h2>
          <p className="ss-instructions">{STEP_TEXT[stage]}</p>
        </div>

        {/* Live regions stay mounted so screen readers announce changes. */}
        <div className="ss-messages">
          <div role="status" aria-live="polite">
            {notice && notice.kind !== 'error' && (
              <p className={`ss-notice ss-notice--${notice.kind}`}>{notice.text}</p>
            )}
          </div>
          <div role="alert">
            {notice?.kind === 'error' && <p className="ss-notice ss-notice--error">{notice.text}</p>}
          </div>
        </div>

        {stage === STAGES.CAMERA && (
          <CameraCapture onCapture={handleCapture} onCancel={closeCamera} onError={handleCameraError} />
        )}

        {stage === STAGES.SOURCE && (
          <ReadingCard reading={reading} onChange={setReading} onNewStory={startNewStory} />
        )}

        {stage === STAGES.SOURCE && (
          <PhotoSourcePicker
            nativeCamera={nativeCamera}
            busy={busy}
            replacing={replacing}
            onOpenLiveCamera={openLiveCamera}
            onFileSelected={handleFile}
            onCancelReplace={() => dispatch({ type: 'CANCEL_REPLACE' })}
          />
        )}

        {stage === STAGES.WORKSPACE && image && (
          <Suspense fallback={<div className="ss-workspace ssw-loading">Opening photo…</div>}>
            <SmartScanWorkspace
              key={image.url}
              image={image}
              reading={reading}
              onReadingChange={setReading}
              onNewStory={startNewStory}
              saveQuote={saveQuote}
              onClose={() => dispatch({ type: 'REMOVE_IMAGE' })}
            />
          </Suspense>
        )}
      </div>
    </div>
  );
}

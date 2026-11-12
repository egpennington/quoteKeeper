import { useCallback, useEffect, useRef, useState } from 'react';
import { describeCameraError } from './imageUtils';

const VIDEO_CONSTRAINTS = {
  facingMode: { ideal: 'environment' }, // rear camera when there is one
  width: { ideal: 1920 },
  height: { ideal: 1080 },
};

function stopStream(stream) {
  stream?.getTracks().forEach((track) => track.stop());
}

/**
 * Live camera preview with Capture / Cancel.
 * The camera stream is stopped on capture, cancel, error, and unmount.
 */
export default function CameraCapture({ onCapture, onCancel, onError }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [capturing, setCapturing] = useState(false);

  const releaseCamera = useCallback(() => {
    stopStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    // Guards against the stream resolving after unmount (incl. StrictMode's
    // mount/unmount/mount in development), which would otherwise leak it.
    let cancelled = false;

    navigator.mediaDevices
      .getUserMedia({ video: VIDEO_CONSTRAINTS, audio: false })
      .then(async (stream) => {
        if (cancelled) {
          stopStream(stream);
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        video.srcObject = stream;
        try {
          await video.play();
        } catch {
          // autoplay is allowed for muted inline video; ignore rare interruptions
        }
        if (!cancelled) setReady(true);
      })
      .catch((err) => {
        if (!cancelled) onError(describeCameraError(err));
      });

    return () => {
      cancelled = true;
      releaseCamera();
    };
  }, [onError, releaseCamera]);

  // Escape cancels the camera.
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  const handleCapture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    setCapturing(true);
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        releaseCamera();
        if (!blob) {
          onError('The photo could not be captured. Please try again.');
          return;
        }
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        onCapture(new File([blob], `smartscan-${stamp}.jpg`, { type: 'image/jpeg' }));
      },
      'image/jpeg',
      0.92,
    );
  };

  return (
    <section className="ss-camera" aria-label="Camera">
      <div className="ss-frame ss-frame--camera">
        <video
          ref={videoRef}
          className="ss-video"
          playsInline
          muted
          autoPlay
          aria-label="Live camera preview"
        />
        {!ready && (
          <p className="ss-frame-overlay" role="status">
            Starting camera… If prompted, allow camera access.
          </p>
        )}
      </div>

      <div className="ss-camera-controls">
        <p className="ss-hint">Fill the frame with the page and hold steady before capturing.</p>

        <div className="ss-actions">
          <button
            type="button"
            className="ss-btn ss-btn--primary"
            onClick={handleCapture}
            disabled={!ready || capturing}
          >
            <span aria-hidden="true">⦿</span> Capture
          </button>
          <button type="button" className="ss-btn ss-btn--secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </section>
  );
}

import { useRef } from 'react';
import { UPLOAD_ACCEPT, formatBytes, MAX_IMAGE_BYTES } from './imageUtils';

/**
 * Take Photo / Upload Photo choice.
 * - nativeCamera: Take Photo opens the device camera app (<input capture>).
 * - otherwise:    Take Photo asks the parent to open the live camera view.
 */
export default function PhotoSourcePicker({
  nativeCamera,
  busy,
  replacing,
  onOpenLiveCamera,
  onFileSelected,
  onCancelReplace,
}) {
  const uploadInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const handleChange = (source) => (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow choosing the same file again later
    if (file) onFileSelected(file, source);
  };

  const handleTakePhoto = () => {
    if (nativeCamera) cameraInputRef.current?.click();
    else onOpenLiveCamera();
  };

  return (
    <section className="ss-source" aria-label="Choose a photo">
      <div className="ss-dropzone">
        <span className="ss-dropzone-icon" aria-hidden="true">📖</span>
        <p className="ss-dropzone-text">
          {replacing ? 'Choose a new photo to replace the current one.' : 'Add a photo of a book page.'}
        </p>
        <p className="ss-hint">
          JPEG, PNG, or WebP · up to {formatBytes(MAX_IMAGE_BYTES)} · stays on this device
        </p>
      </div>

      <div className="ss-actions">
        <button
          type="button"
          className="ss-btn ss-btn--primary"
          onClick={handleTakePhoto}
          disabled={busy}
        >
          <span aria-hidden="true">📷</span> Take Photo
        </button>
        <button
          type="button"
          className="ss-btn ss-btn--secondary"
          onClick={() => uploadInputRef.current?.click()}
          disabled={busy}
        >
          <span aria-hidden="true">🖼️</span> Upload Photo
        </button>
      </div>

      {replacing && (
        <button type="button" className="ss-btn ss-btn--text" onClick={onCancelReplace} disabled={busy}>
          Keep current photo
        </button>
      )}

      <input
        ref={uploadInputRef}
        className="ss-visually-hidden"
        type="file"
        accept={UPLOAD_ACCEPT}
        onChange={handleChange('upload')}
        tabIndex={-1}
        aria-label="Upload a photo from this device"
      />
      <input
        ref={cameraInputRef}
        className="ss-visually-hidden"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleChange('camera')}
        tabIndex={-1}
        aria-label="Take a photo with the device camera"
      />
    </section>
  );
}

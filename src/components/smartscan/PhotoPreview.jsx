import { formatBytes } from './imageUtils';

export default function PhotoPreview({ image, onReplace, onRemove }) {
  const sourceLabel = image.source === 'camera' ? 'Camera' : 'Upload';

  return (
    <section className="ss-preview" aria-label="Selected photo">
      <figure className="ss-frame">
        <img className="ss-image" src={image.url} alt="Selected book page" />
        <figcaption className="ss-meta">
          {sourceLabel} · {image.width}×{image.height} · {formatBytes(image.size)}
        </figcaption>
      </figure>

      <div className="ss-preview-side">
        <div className="ss-actions">
          <button type="button" className="ss-btn ss-btn--secondary" onClick={onReplace}>
            <span aria-hidden="true">🔄</span> Replace Photo
          </button>
          <button type="button" className="ss-btn ss-btn--danger" onClick={onRemove}>
            <span aria-hidden="true">🗑️</span> Remove Photo
          </button>
        </div>

        {/* Sprint 2 entry point: Photo -> Text Recognition */}
        <button
          type="button"
          className="ss-btn ss-btn--primary ss-btn--block"
          disabled
          aria-describedby="ss-next-step-note"
        >
          Recognize Text
        </button>
        <p id="ss-next-step-note" className="ss-hint ss-center">
          Text recognition is coming in the next SmartScan update.
        </p>
      </div>
    </section>
  );
}

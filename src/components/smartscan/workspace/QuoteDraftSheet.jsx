import { useEffect, useRef } from 'react';
import TagSelect from '../../TagSelect';

// Editable quote draft opened from a SmartScan selection. Covers the photo while
// open; Cancel or Save returns to the same photo, zoom, and position.
export default function QuoteDraftSheet({ draft, saving, notice, onChange, onCancel, onSave }) {
  const headingRef = useRef(null);

  // Move focus into the sheet for keyboard and screen-reader users, without
  // popping the phone keyboard over the text they need to proofread.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !saving) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saving, onCancel]);

  const field = (name) => (e) => onChange(name, e.target.value);
  const empty = !draft.quote.trim();

  const submit = (e) => {
    e.preventDefault();
    if (!empty && !saving) onSave();
  };

  return (
    <div className="ssw-sheet" role="dialog" aria-modal="true" aria-labelledby="ssw-sheet-title">
      <form className="ssw-sheet-body" onSubmit={submit}>
        <div className="ssw-sheet-head">
          <h2 id="ssw-sheet-title" className="ss-heading" tabIndex={-1} ref={headingRef}>
            Edit quote
          </h2>
          <p className="ss-hint">Check the text against the page and fix any recognition mistakes.</p>
        </div>

        <label className="ssw-field">
          <span>Quote</span>
          <textarea
            className="quote-textarea ssw-quote-text"
            rows={6}
            value={draft.quote}
            onChange={field('quote')}
            required
            spellCheck
          />
        </label>
        <label className="ssw-field">
          <span>Author</span>
          <input type="text" className="quote-input" value={draft.author} onChange={field('author')} autoComplete="off" />
        </label>
        <label className="ssw-field">
          <span>Source (optional)</span>
          <input
            type="text"
            className="quote-input"
            value={draft.source}
            onChange={field('source')}
            placeholder="Book title, page…"
            autoComplete="off"
          />
        </label>
        <div className="ssw-field">
          <span id="ssw-tags-label">Tags</span>
          <TagSelect
            selectedTags={draft.tags}
            setSelectedTags={(tags) => onChange('tags', tags || [])}
            aria-labelledby="ssw-tags-label"
            menuPlacement="auto"
          />
        </div>
        <label className="ssw-field">
          <span>Notes (optional)</span>
          <textarea
            className="quote-textarea"
            rows={2}
            value={draft.notes}
            onChange={field('notes')}
            placeholder="Notes or insights…"
          />
        </label>

        <div role="alert" className="ssw-sheet-alert">
          {notice?.kind === 'error' && <p className="ss-notice ss-notice--error">{notice.text}</p>}
        </div>

        <div className="ssw-sheet-actions">
          <button type="button" className="ss-btn ss-btn--secondary" onClick={onCancel} disabled={saving}>
            Back to photo
          </button>
          <button type="submit" className="ss-btn ss-btn--primary" disabled={empty || saving}>
            {saving ? 'Saving…' : 'Save quote'}
          </button>
        </div>
      </form>
    </div>
  );
}

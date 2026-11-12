import { useState } from 'react';
import ReadingForm from './ReadingForm';
import { hasReading } from './readingSession';

// Compact "what am I reading" summary on the photo-source screen.
// One line when set (source, author, Change / New Story); expands to the form.
export default function ReadingCard({ reading, onChange, onNewStory }) {
  const [editing, setEditing] = useState(false);
  const set = hasReading(reading);

  if (editing) {
    return (
      <section className="ss-reading ss-reading--editing" aria-label="Reading session">
        <ReadingForm
          reading={reading}
          onSave={(next) => {
            onChange(next);
            setEditing(false);
          }}
          onNewStory={onNewStory}
          onClose={() => setEditing(false)}
        />
      </section>
    );
  }

  return (
    <section className="ss-reading" aria-label="Reading session">
      <div className="ss-reading-summary">
        <span className="ss-reading-kicker">{set ? 'Reading' : 'Reading session'}</span>
        {set ? (
          <p className="ss-reading-title">
            <strong>{reading.source || 'Untitled source'}</strong>
            {reading.author && <span> · {reading.author}</span>}
          </p>
        ) : (
          <p className="ss-reading-title ss-reading-title--empty">Set the author and source once for all your quotes.</p>
        )}
      </div>
      <div className="ss-reading-buttons">
        <button type="button" className="ss-btn ss-btn--secondary ss-btn--small" onClick={() => setEditing(true)}>
          {set ? 'Change' : 'Set'}
        </button>
        {set && (
          <button type="button" className="ss-btn ss-btn--secondary ss-btn--small" onClick={onNewStory}>
            New Story
          </button>
        )}
      </div>
    </section>
  );
}

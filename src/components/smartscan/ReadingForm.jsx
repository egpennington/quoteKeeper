import { useRef, useState } from 'react';
import { hasReading } from './readingSession';

// Edits the reading session (author + source applied to every new quote).
// Used inline on the photo-source screen and inside a sheet in the workspace.
//
// "New Story" clears the session immediately (not just these inputs), so the
// previous source can't be applied again even if the form is then closed.
export default function ReadingForm({ reading, onSave, onNewStory, onClose }) {
  const [author, setAuthor] = useState(reading.author);
  const [source, setSource] = useState(reading.source);
  const [cleared, setCleared] = useState(false);
  const authorRef = useRef(null);

  const submit = (e) => {
    e.preventDefault();
    onSave({ author, source });
  };

  const newStory = () => {
    onNewStory();
    setAuthor('');
    setSource('');
    setCleared(true);
    authorRef.current?.focus();
  };

  return (
    <form className="ss-reading-form" onSubmit={submit}>
      <label className="ss-field">
        <span>Author</span>
        <input
          ref={authorRef}
          type="text"
          className="quote-input"
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          placeholder="e.g. Isaac Asimov"
          autoComplete="off"
        />
      </label>
      <label className="ss-field">
        <span>Source</span>
        <input
          type="text"
          className="quote-input"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="Book or story title"
          autoComplete="off"
        />
      </label>
      <p className="ss-hint" role="status">
        {cleared
          ? 'New story started: the previous author and source were cleared. Enter the new ones, or leave these blank and fill them in on your first quote.'
          : 'Used for every quote you scan, on every photo, until you change it or start a new story.'}
      </p>
      <div className="ss-reading-actions">
        <button type="button" className="ss-btn ss-btn--secondary" onClick={newStory} disabled={!hasReading(reading) && !author && !source}>
          New Story
        </button>
        <button type="button" className="ss-btn ss-btn--secondary" onClick={onClose}>
          {cleared ? 'Close' : 'Cancel'}
        </button>
        <button type="submit" className="ss-btn ss-btn--primary">
          Save
        </button>
      </div>
    </form>
  );
}

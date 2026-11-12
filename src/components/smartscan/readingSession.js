// SmartScan reading session: the author and source of what is being read now.
// (Pure functions; storage is passed in so tests can use a fake.)
//
// The session lives above the photo workspace, so it carries across every
// passage and every photograph until the user changes it or starts a new story.
// It is kept on this device only (localStorage) and is not a Firestore
// document: each saved quote simply gets its usual `author` and `source` fields.
//
// Rules:
//   - A new quote draft is prefilled from the session.
//   - Editing author/source inside one draft affects that quote only...
//   - ...except that fields the session doesn't have yet are learned from the
//     first quote saved (so typing them once in a draft is enough).
//   - "New Story" clears the session. Nothing else clears or replaces a field
//     that is set, so an old source can't come back by accident.

export const EMPTY_READING = Object.freeze({ author: '', source: '' });

const clean = (v) => (typeof v === 'string' ? v.trim() : '');

export function normalizeReading(value) {
  return { author: clean(value?.author), source: clean(value?.source) };
}

export const hasReading = (reading) => Boolean(reading.author || reading.source);

/** One-line summary, e.g. "Segregationist · Isaac Asimov". Empty string if unset. */
export function readingLabel(reading) {
  return [reading.source, reading.author].filter(Boolean).join(' · ');
}

/** After a quote is saved: fill only the session fields that are still empty. */
export function adoptFromQuote(reading, quote) {
  const saved = normalizeReading(quote);
  return { author: reading.author || saved.author, source: reading.source || saved.source };
}

// ---- Persistence (this device, per signed-in user) -------------------------

const storageKey = (userId) => `quotekeeper.smartscan.reading.v1.${userId || 'anonymous'}`;

export function loadReading(storage, userId) {
  try {
    return normalizeReading(JSON.parse(storage.getItem(storageKey(userId))));
  } catch {
    return { ...EMPTY_READING };
  }
}

export function saveReading(storage, userId, reading) {
  try {
    if (hasReading(reading)) storage.setItem(storageKey(userId), JSON.stringify(normalizeReading(reading)));
    else storage.removeItem(storageKey(userId));
  } catch {
    /* storage unavailable (private mode, quota): the session still works in memory */
  }
}

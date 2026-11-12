// The Firestore `quotes` document shape, shared by manual entry (QuoteForm)
// and SmartScan so both always write the same fields:
//   { quote, author, source, tags: string[], notes, createdAt: ISO string }
// Pure module: no Firebase import, so it can be tested without a database.

export function buildQuoteRecord({ quote, author = '', source = '', tags = [], notes = '' }, now = new Date()) {
  return {
    quote: (quote ?? '').trim(),
    author: author.trim(),
    source: source.trim(),
    tags: tags.map((t) => (typeof t === 'string' ? t : t.value)).filter(Boolean),
    notes,
    createdAt: now.toISOString(),
  };
}

/**
 * Builds and writes one quote. `write(record)` performs the actual insert
 * (Firestore addDoc in the app, a mock in tests). Rejects an empty quote.
 */
export async function persistQuote(draft, write, now = new Date()) {
  const record = buildQuoteRecord(draft, now);
  if (!record.quote) throw new Error('The quote is empty.');
  await write(record);
  return record;
}

export const toTagObjects = (arr) =>
  (arr || []).map(t => (typeof t === 'string' ? { value: t, label: t } : t));

export const toTagStrings = (arr) =>
  (arr || []).map(t => (typeof t === 'string' ? t : t.value)).filter(Boolean);

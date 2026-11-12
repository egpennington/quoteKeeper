// Records every write in window.__fs; never touches a real database.
window.__fs = { writes: [], updates: [], deletes: [], failNext: false };
export const initializeFirestore = () => ({ mock: true });
export const persistentLocalCache = () => ({});
export const persistentMultipleTabManager = () => ({});
export const collection = (_db, name) => ({ name });
export const doc = (_db, name, id) => ({ name, id });
export const addDoc = async (ref, data) => {
  await new Promise((r) => setTimeout(r, 150));
  if (window.__fs.failNext) { window.__fs.failNext = false; throw new Error('mock offline'); }
  window.__fs.writes.push({ collection: ref.name, data: JSON.parse(JSON.stringify(data)) });
  return { id: `mock-${window.__fs.writes.length}` };
};
export const getDocs = async () => ({ docs: window.__fs.writes.map((w, i) => ({ id: `mock-${i + 1}`, data: () => w.data })) });
export const updateDoc = async (ref, data) => { window.__fs.updates.push({ ref, data }); };
export const deleteDoc = async (ref) => { window.__fs.deletes.push(ref); };
export const increment = (n) => ({ increment: n });

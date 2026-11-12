// Signed-in test user; no network.
const user = { uid: 'test-uid-123', email: 'tester@example.test' };
window.__auth = { signOutCalls: 0 };
export const getAuth = () => ({ currentUser: user });
export const setPersistence = async () => {};
export const browserLocalPersistence = {};
export const onAuthStateChanged = (_auth, cb) => { setTimeout(() => cb(window.__signedOut ? null : user), 0); return () => {}; };
export const signOut = async () => { window.__auth.signOutCalls++; };
export const signInWithEmailAndPassword = async () => ({ user });

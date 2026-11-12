import { lazy, Suspense, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './firebase';

import LoginSplash from './components/LoginSplash';
import QuoteForm from './components/QuoteForm';
import QuoteLibrary from './components/QuoteLibrary';
import SmartScan from './components/SmartScan';
import { LAB_HASH, isLabUser } from './components/smartscan/lab/labAccess';

// Temporary Sprint 2A-0 OCR test view. Loaded on demand only for allowlisted
// users, so OCR code never downloads for anyone else.
const OcrLab = lazy(() => import('./components/smartscan/lab/OcrLab'));

export default function App() {
  const [user, setUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [view, setView] = useState('form');
  const [hash, setHash] = useState(() => window.location.hash);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setCheckingAuth(false);
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  if (checkingAuth) return null;
  if (!user) return <LoginSplash />;

  if (hash === LAB_HASH && isLabUser(user)) {
    const exitLab = () => {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      setHash('');
    };
    return (
      <Suspense fallback={<p className="lab-loading">Loading OCR Lab…</p>}>
        <OcrLab onExit={exitLab} />
      </Suspense>
    );
  }

  return (
    <>
      <header className="app-header">
        <span>Signed in as {user.email}</span>
        {/* Test accounts only: the installed PWA has no address bar for /#ocr-lab. */}
        {isLabUser(user) && (
          <button type="button" onClick={() => { window.location.hash = LAB_HASH; }}>
            OCR Lab
          </button>
        )}
        <button onClick={() => signOut(auth)}>Sign out</button>
      </header>

      {view === 'library' ? (
        <QuoteLibrary onBack={() => setView('form')} />
      ) : view === 'scan' ? (
        <SmartScan onBack={() => setView('form')} />
      ) : (
        <QuoteForm
          onShowLibrary={() => setView('library')}
          onShowScan={() => setView('scan')}
        />
      )}
    </>
  );
}

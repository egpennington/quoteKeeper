import { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './firebase';

import LoginSplash from './components/LoginSplash';
import QuoteForm from './components/QuoteForm';
import QuoteLibrary from './components/QuoteLibrary';
import SmartScan from './components/SmartScan';

export default function App() {
  const [user, setUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [view, setView] = useState('form');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setCheckingAuth(false);
    });

    return () => unsub();
  }, []);

  if (checkingAuth) return null;
  if (!user) return <LoginSplash />;

  return (
    <>
      {/* SmartScan is a full-screen photo workspace, so the account bar is hidden
          while it's open. This only affects rendering; the session is unchanged. */}
      {view !== 'scan' && (
        <header className="app-header">
          <span>Signed in as {user.email}</span>
          <button onClick={() => signOut(auth)}>Sign out</button>
        </header>
      )}

      {view === 'library' ? (
        <QuoteLibrary onBack={() => setView('form')} />
      ) : view === 'scan' ? (
        <SmartScan onBack={() => setView('form')} userId={user.uid} />
      ) : (
        <QuoteForm
          onShowLibrary={() => setView('library')}
          onShowScan={() => setView('scan')}
        />
      )}
    </>
  );
}

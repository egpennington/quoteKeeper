import { useEffect, useState } from "react"
import { onAuthStateChanged, signOut } from "firebase/auth"
import { auth } from "./firebase"

import LoginSplash from "./components/LoginSplash"
import QuoteForm from "./components/QuoteForm"
import QuoteLibrary from "./components/QuoteLibrary"

// temp upload of quotes
// import UploadSeedQuotes from './components/UploadSeedQuotes.jsx';

export default function App() {
  const [user, setUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [showLibrary, setShowLibrary] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setCheckingAuth(false);
    });
    return () => unsub();
  }, []);

  // Optional: small loader while Firebase restores session
  if (checkingAuth) return null; // or <div className="loading">Loading…</div>

  // Not signed in → show your login/landing screen
  if (!user) return <LoginSplash />;

  return (
    <>
      <header className="app-header">
        <span>Signed in as {user.email}</span>
        <button onClick={() => signOut(auth)}>Sign out</button>
      </header>

      {showLibrary ? (
        <QuoteLibrary onBack={() => setShowLibrary(false)} />
      ) : (
        <QuoteForm onShowLibrary={() => setShowLibrary(true)} />
      )}
    </>
  );
}

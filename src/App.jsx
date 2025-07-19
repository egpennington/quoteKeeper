import { useState } from 'react'
import QuoteForm from './components/QuoteForm.jsx'
import QuoteLibrary from './components/QuoteLibrary.jsx'
import SplashPage from './components/SplashPage.jsx';
// temp upload of quotes
// import UploadSeedQuotes from './components/UploadSeedQuotes.jsx';

function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [showLibrary, setShowLibrary] = useState(false)

  if (showSplash) {
    return <SplashPage onEnter={() => setShowSplash(false)} />;
  }
  
  return (
    <>
      {showLibrary ? (
        <QuoteLibrary onBack={() => setShowLibrary(false)} />
      ) : (
        <QuoteForm onShowLibrary={() => setShowLibrary(true)} />
      )}
    </>
  )
}

export default App

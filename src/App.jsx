import { useState } from 'react'
import QuoteForm from './components/QuoteForm.jsx'
import QuoteLibrary from './components/QuoteLibrary.jsx'

function App() {
  const [showLibrary, setShowLibrary] = useState(false)
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

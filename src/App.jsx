import { useState } from 'react'

function App() {
  const [count, setCount] = useState(0)

  return (
    <>
      <div className="title">
        <h1>📃quoteKeeper</h1>                
      </div>
      
      <div className="card">
        <label name="quote-area" id="quote-area">QUOTE</label>
        <textarea type="text" id="quote-area" class="quote-area" rows="20" cols="100"></textarea>
        <label name="author">Author</label>
        <input type="text" id="author">Author</input>
        <button id="btn" className="btn">
          Quote
        </button>
        <p>
          Edit <code>src/App.jsx</code> and save to test HMR
        </p>
      </div>
      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
    </>
  )
}

export default App

import { useState } from 'react'
import { collection, addDoc } from 'firebase/firestore'
import { db } from '../firebase'
import TagSelect from './TagSelect'

export default function QuoteForm( {onShowLibrary} ) {
  const [quote, setQuote] = useState('')
  const [source, setSource] = useState('')
  const [author, setAuthor] = useState('')
  const [selectedTags, setSelectedTags] = useState([])
  const [notes, setNotes] = useState('')
  const [showNotes, setShowNotes] = useState(false)  

  const handleSubmit = async (e) => {
    e.preventDefault()

    const newQuote = {
      quote,
      author,
      source,
      tags: selectedTags.map(tag => tag.value),
      notes,
      createdAt: new Date().toISOString()
    }

      try {
        await addDoc(collection(db, 'quotes'), newQuote)
        console.log('Quote saved to Firebase:', newQuote)
        // Clear form (optional)
        setQuote('')
        setAuthor('')
        setSource('')
        setSelectedTags([])
        setNotes('')
      } catch (err) {
        console.error('Error saving to Firebase:', err)
      }
      console.log("quote", newQuote)
  }

  return (
    <div className="quote-form-container">
      <div className="quote-form-header">
        <span className="quote-icon">📃</span>
        <h1 className="quote-title">Quote Keeper</h1>
      </div>
      <form onSubmit={handleSubmit} className="quote-form">
        <textarea
          className="quote-textarea"
          rows="4"
          placeholder="Enter quote..."
          value={quote}
          onChange={(e) => setQuote(e.target.value)}
          required
        />
        <input
          type="text"
          className="quote-input"
          placeholder="Author"
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
        />
        <input
          type="text"
          className="quote-input"
          placeholder="Source (optional)"
          value={source}
          onChange={(e) => setSource(e.target.value)}
        />

        <TagSelect selectedTags={selectedTags} setSelectedTags={setSelectedTags} />

        <button
          type="button"
          id="notes"
          onClick={ () => 
            setShowNotes(prev => !prev)
          }          
        >+Notes</button>

        {showNotes && (
          <textarea 
            id="notes-textarea"
            className="notes-textarea"
            rows="4"
            placeholder="Enter notes/insights..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        )}        

        <div className="quote-form-buttons">
          <button type="submit" className="quote-button">+ Quote</button>
          <button 
            type="button" 
            className="tag-button"
            onClick={onShowLibrary}
          >🔍 Q Library</button>
        </div>
      </form>
    </div>
  )
}
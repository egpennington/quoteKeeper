import { useEffect, useState } from 'react'
import { collection, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore'
import { db } from '../firebase'

export default function QuoteLibrary({ onBack }) {
  const [quotes, setQuotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingQuote, setEditingQuote] = useState(null)
  const [editFields, setEditFields] = useState({
    quote: '',
    author: '',
    source: '',
    notes: '',
    isLiked: false

  })
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    const fetchQuotes = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, 'quotes'))
        const data = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        setQuotes(data)
      } catch (err) {
        console.error('Error fetching quotes:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchQuotes()
  }, [])

  const handleLike = async (id, currentLikes) => {
    try {
      const quoteRef = doc(db, 'quotes', id)
      await updateDoc(quoteRef, {
        likes: currentLikes + 1,
        isLiked: true
      })

      setQuotes(prev =>
        prev.map(q => q.id === id ? {...q, likes: (q.likes || 0) + 1, isLiked: true } : q))
           
    } catch (err) {
      console.error('Failed to like quote:', err)
    }
  }


  const handleEdit = (quote) => {
    setEditingQuote(quote.id)
    setEditFields({
      quote: quote.quote,
      author: quote.author,
      source: quote.source || '',
      notes: quote.notes || '',
      isLiked: quote.isLiked || false
    })
  }

  const handleSave = async (id) => {
    try {
      const quoteRef = doc(db, 'quotes', id)
      await updateDoc(quoteRef, editFields)
      setQuotes(prev =>
        prev.map(q => (q.id === id ? { ...q, ...editFields } : q))
      )
      setEditingQuote(null)
    } catch (err) {
      console.error('Failed to update quote:', err)
    }
  }

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this quote?')) {
      try {
        await deleteDoc(doc(db, 'quotes', id))
        setQuotes(prev => prev.filter(q => q.id !== id))
        console.log(`Quote ${id} deleted`)
      } catch (err) {
        console.error('Error deleting quote:', err)
      }
    }
  }

  const filteredQuotes = quotes.filter((q) => {
    const combined = `${q.quote} ${q.author} ${q.source || ''} ${q.notes || ''} ${(q.tags || []).join(' ')}`.toLowerCase()
    return combined.includes(searchTerm.toLowerCase())
  })

  return (
    <div className="quote-library-container">
      <div className="quote-library-header">
        <h2>📚 Quote Library</h2>
        <button className="back-button" onClick={onBack}>X Close</button>
      </div>

      <div className="quote-search-bar">
        <input
          type="text"
          placeholder="Search quotes, authors, tags, or notes..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {loading ? (
        <p>Loading quotes...</p>
      ) : filteredQuotes.length === 0 ? (
        <p>No matching quotes found.</p>
      ) : (
        <ul className="quote-list">
          {filteredQuotes.map(q => (
            <li key={q.id} className="quote-card">
              <button
                className={`like-button ${q.isLiked ? 'liked' : ''}`}
                onClick={() => handleLike(q.id, q.likes || 0)}
              >
                {q.isLiked ? '❤️' : '🤍'} {q.likes || 0}
              </button>

              {editingQuote === q.id ? (
                <form className="edit-form" onSubmit={(e) => { e.preventDefault(); handleSave(q.id) }}>
                  <textarea
                    value={editFields.quote}
                    onChange={(e) => setEditFields({ ...editFields, quote: e.target.value })}
                    placeholder="Edit quote"
                    rows={3}
                  />
                  <input
                    type="text"
                    value={editFields.author}
                    onChange={(e) => setEditFields({ ...editFields, author: e.target.value })}
                    placeholder="Edit author"
                  />
                  <input
                    type="text"
                    value={editFields.source}
                    onChange={(e) => setEditFields({ ...editFields, source: e.target.value })}
                    placeholder="Edit source"
                  />
                  <textarea
                    value={editFields.notes}
                    onChange={(e) => setEditFields({ ...editFields, notes: e.target.value })}
                    placeholder="Edit notes"
                    rows={2}
                  />
                  <div className="edit-form-buttons">
                    <button type="submit" className="save-button">💾 Save</button>
                    <button type="button" className="cancel-button" onClick={() => setEditingQuote(null)}>❌ Cancel</button>
                  </div>
                </form>
              ) : (
                <div className="quote-card-buttons">                  
                  <blockquote>"{q.quote}"</blockquote>
                  <p><strong>- {q.author}</strong></p>
                  {q.source && <p><em>Source:</em> {q.source}</p>}
                  {q.tags && <p><em>Tags:</em> {q.tags.join(', ')}</p>}
                  {q.notes && <p><em>Notes:</em> {q.notes}</p>}
                  <button className="edit-button" onClick={() => handleEdit(q)}>✏️ Edit</button>
                  <button className="delete-button" onClick={() => handleDelete(q.id)}>❌ Delete</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

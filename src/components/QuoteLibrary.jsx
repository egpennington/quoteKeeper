import { useEffect, useState } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../firebase'

export default function QuoteLibrary({ onBack }) {
  const [quotes, setQuotes] = useState([])
  const [loading, setLoading] = useState(true)

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

  return (
    <div className="quote-library-container">
      <div className="quote-library-header">
        <h2>📚 Quote Library</h2>
        <button className="back-button" onClick={onBack}>X Close</button>
      </div>

      {loading ? (
        <p>Loading quotes...</p>
      ) : (
        quotes.length === 0 ? (
          <p>No quotes saved yet.</p>
        ) : (
          <ul className="quote-list">
            {quotes.map(q => (
              <li key={q.id} className="quote-card">
                <blockquote>"{q.quote}"</blockquote>
                <p><strong>- {q.author}</strong></p>
                {q.source && <p><em>Source:</em> {q.source}</p>}
                {q.tags && <p><em>Tags:</em> {q.tags.join(', ')}</p>}
                {q.notes && <p><em>Notes:</em> {q.notes}</p>}
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  )
}

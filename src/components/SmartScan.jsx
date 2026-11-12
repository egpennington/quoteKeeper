export default function SmartScan({ onBack }) {
  return (
    <div className="quote-form-container">
      <div className="quote-form-header">
        <img className="quote-icon" src="/logo.png" alt="QuoteKeeper logo" />
        <h1 className="quote-title">SmartScan</h1>
      </div>

      <div className="quote-form">
        <h2>Scan a Quote</h2>
        <p>
          Photograph a book page, select your favorite passages, and save them
          to QuoteKeeper.
        </p>

        <button type="button" className="quote-button" disabled>
          📷 Scan Book Page — Coming Soon
        </button>

        <button type="button" className="tag-button" onClick={onBack}>
          ← Back to QuoteKeeper
        </button>
      </div>
    </div>
  );
}

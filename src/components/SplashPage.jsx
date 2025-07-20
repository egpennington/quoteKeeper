import React from "react";

function SplashPage({ onEnter }) {
  return (
    <div className="splash-container">
      <h1 className="title">📚 quoteKeeper</h1>
      <p className="motto">
        "One quote can change a moment.
      </p>
      <p className="moto">A library of them can change a life."
      </p>
      <button className="enter-btn" onClick={onEnter}>
        Enter the Library
      </button>
    </div>
  );
}

export default SplashPage;

import { useState } from "react";
import { auth } from "../firebase";
import { signInWithEmailAndPassword } from "firebase/auth";

export default function LoginSplash() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  async function handleSignIn(e) {
    e.preventDefault();
    setErr("");
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged in App.jsx will switch the view to your app
    } catch (error) {
      setErr(error.code || error.message);
      console.error(error);
    }
  }

  return (
    <div className="splash-container">
      <h1 className="title">📚 quoteKeeper</h1>
      <p className="motto">
        "One quote can change a moment.<br />
        A library of them can change a life."
      </p>

      <div className="login">
        <div className="logged-container">
          <form className="auth-fields-and-buttons" onSubmit={handleSignIn} autoComplete="on">
            <input
              type="email"
              id="email-input"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
            />
            <input
              type="password"
              id="password-input"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />

            {err && <small style={{ color: "crimson" }}>{err}</small>}

            <button id="sign-in-btn" className="primary-btn" type="submit">
              Sign In
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
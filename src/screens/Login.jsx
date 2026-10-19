import { useState } from 'react';
import { useAuth } from '../auth.jsx';
import { Spinner } from '../components/ui.jsx';

export default function Login() {
  const { signInGoogle, sendLink, error, linkBusy } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  if (linkBusy) return <Spinner label="Signing you in…" />;

  return (
    <div className="login">
      <img src="/icons/icon-192.png" alt="" width="84" height="84" className="logo" />
      <h1>Mayapuri Stock</h1>
      <p className="muted">Generator &amp; motor parts — stock book</p>

      <button
        className="btn big google"
        onClick={async () => {
          setBusy(true);
          await signInGoogle();
          setBusy(false);
        }}
        disabled={busy}
      >
        <svg width="22" height="22" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z" />
          <path fill="#FBBC05" d="M10.5 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.1z" />
          <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
        </svg>
        Sign in with Google
      </button>

      <div className="or">or get a sign-in link by email</div>

      {sent ? (
        <div className="notice ok">
          Link sent to <b>{email}</b>. Open that email <b>on this phone</b> and tap the link. Check Spam if you cannot see it.
        </div>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setSent(await sendLink(email));
            setBusy(false);
          }}
        >
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="your email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-label="Email address"
          />
          <button className="btn big" type="submit" disabled={busy || !email}>
            Email me a link
          </button>
        </form>
      )}

      {error && <div className="notice err" role="alert">{error}</div>}
      <p className="tiny muted">Only people invited by the owner can use this app.</p>
    </div>
  );
}

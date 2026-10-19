import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import {
  onAuthStateChanged, signOut as fbSignOut, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { upsertProfile, readOwnerProbe } from '../lib/ops';
import { friendly } from '../lib/errors';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

const EMAIL_KEY = 'emailForSignIn';
const safe = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  del: (k) => { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('timeout'), { code: 'unavailable' })), ms))]);

async function resolveRole(user) {
  const cacheKey = 'role:' + user.uid;
  try {
    let role;
    try {
      await withTimeout(readOwnerProbe(), 7000);
      role = 'owner';
    } catch (e) {
      if (e.code !== 'permission-denied') throw e;
      const inv = await withTimeout(getDoc(doc(db, 'invites', user.email.toLowerCase())), 7000);
      role = inv.exists() ? 'staff' : 'none';
    }
    safe.set(cacheKey, role);
    return role;
  } catch (e) {
    const cached = safe.get(cacheKey);
    if (cached && cached !== 'none') return cached; // offline: trust last known role
    throw e;
  }
}

export function AuthProvider({ children }) {
  // status: loading | signedOut | checking | noAccess | ready | error
  const [state, setState] = useState({ status: 'loading', profile: null, error: '' });
  const [linkPending, setLinkPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [authError, setAuthError] = useState('');
  const userRef = useRef(null);

  const evaluate = useCallback(async (user) => {
    userRef.current = user;
    if (!user) { setState({ status: 'signedOut', profile: null, error: '' }); return; }
    if (!user.email || !user.emailVerified) {
      setState({ status: 'noAccess', profile: { email: user.email || '' }, error: '' });
      return;
    }
    setState((s) => ({ ...s, status: 'checking' }));
    try {
      const role = await resolveRole(user);
      if (role === 'none') { setState({ status: 'noAccess', profile: { email: user.email }, error: '' }); return; }
      const profile = {
        uid: user.uid,
        email: user.email.toLowerCase(),
        name: (user.displayName || user.email.split('@')[0]).slice(0, 100),
        photo: user.photoURL || '',
        role,
      };
      setState({ status: 'ready', profile, error: '' });
      if (navigator.onLine) upsertProfile(user, role);
    } catch (e) {
      setState({ status: 'error', profile: null, error: friendly(e) });
    }
  }, []);

  useEffect(() => {
    // Finish e-mail-link sign-in if this page was opened from the link.
    if (isSignInWithEmailLink(auth, window.location.href)) {
      const stored = safe.get(EMAIL_KEY);
      if (stored) completeLink(stored);
      else setLinkPending(true);
    }
    return onAuthStateChanged(auth, (u) => evaluate(u));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evaluate]);

  async function completeLink(email) {
    setBusy(true); setAuthError('');
    try {
      await signInWithEmailLink(auth, email.trim(), window.location.href);
      safe.del(EMAIL_KEY);
      setLinkPending(false);
      window.history.replaceState({}, '', window.location.pathname);
    } catch (e) { setAuthError(friendly(e)); }
    setBusy(false);
  }

  async function google() {
    setBusy(true); setAuthError(''); setMessage('');
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try { await signInWithPopup(auth, provider); }
    catch (e) {
      if (e.code === 'auth/popup-blocked') { try { await signInWithRedirect(auth, provider); return; } catch (e2) { setAuthError(friendly(e2)); } }
      else setAuthError(friendly(e));
    }
    setBusy(false);
  }

  async function sendLink(email) {
    setBusy(true); setAuthError(''); setMessage('');
    try {
      await sendSignInLinkToEmail(auth, email.trim(), { url: window.location.origin + '/', handleCodeInApp: true });
      safe.set(EMAIL_KEY, email.trim());
      setMessage(`Sign-in link sent to ${email.trim()}. Open that e-mail on this phone and tap the link.`);
    } catch (e) { setAuthError(friendly(e)); }
    setBusy(false);
  }

  const signOut = () => fbSignOut(auth);
  const recheck = () => evaluate(userRef.current);

  return (
    <Ctx.Provider value={{ ...state, linkPending, busy, message, authError, google, sendLink, completeLink, signOut, recheck }}>
      {children}
    </Ctx.Provider>
  );
}

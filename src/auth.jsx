import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  onAuthStateChanged,
  signOut,
} from 'firebase/auth';
import { doc, onSnapshot, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase.js';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

const EMAIL_KEY = 'ms.emailForSignIn';

async function register(user) {
  const email = (user.email || '').toLowerCase();
  let name = user.displayName || email.split('@')[0];
  try {
    const inv = await getDoc(doc(db, 'invites', email));
    if (inv.exists() && inv.data().name) name = inv.data().name;
  } catch {
    /* no invite readable */
  }
  name = name.trim().slice(0, 80) || 'User';
  // The server decides: "staff" only works if the owner invited this email,
  // "owner" only works for the owner email written in the security rules.
  for (const role of ['staff', 'owner']) {
    try {
      await setDoc(doc(db, 'users', user.uid), { email, name, role, createdAt: serverTimestamp() });
      return true;
    } catch (e) {
      if (e.code !== 'permission-denied') throw e;
    }
  }
  return false;
}

export function AuthProvider({ children }) {
  const [fbUser, setFbUser] = useState(undefined); // undefined = not known yet
  const [profile, setProfile] = useState(undefined);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState('');
  const [linkBusy, setLinkBusy] = useState(false);

  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setFbUser(u);
        setProfile(undefined);
        setDenied(false);
      }),
    []
  );

  // Finish an email-link sign-in if this page was opened from the email.
  useEffect(() => {
    if (!isSignInWithEmailLink(auth, window.location.href)) return;
    let email = '';
    try {
      email = localStorage.getItem(EMAIL_KEY) || '';
    } catch {
      /* ignore */
    }
    if (!email) email = window.prompt('Please type the email address you used to request the sign-in link:') || '';
    if (!email) return;
    setLinkBusy(true);
    signInWithEmailLink(auth, email.trim(), window.location.href)
      .then(() => {
        try {
          localStorage.removeItem(EMAIL_KEY);
        } catch {
          /* ignore */
        }
      })
      .catch((e) => setError(friendlyAuthError(e)))
      .finally(() => {
        setLinkBusy(false);
        window.history.replaceState({}, '', window.location.pathname);
      });
  }, []);

  // Watch this person's profile (holds the role). Works offline from cache.
  useEffect(() => {
    if (!fbUser) return undefined;
    let registering = false;
    const unsub = onSnapshot(
      doc(db, 'users', fbUser.uid),
      (snap) => {
        if (snap.exists()) {
          setProfile({ uid: fbUser.uid, ...snap.data() });
          setDenied(false);
          return;
        }
        if (snap.metadata.fromCache) return; // wait for the server's answer
        setProfile(null);
        if (registering) return;
        registering = true;
        register(fbUser)
          .then((ok) => !ok && setDenied(true))
          .catch((e) => setError(friendlyAuthError(e)))
          .finally(() => {
            registering = false;
          });
      },
      (e) => setError(friendlyAuthError(e))
    );
    return unsub;
  }, [fbUser]);

  const signInGoogle = useCallback(async () => {
    setError('');
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      await signInWithPopup(auth, provider);
    } catch (e) {
      if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') {
        await signInWithRedirect(auth, provider);
      } else if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') {
        setError(friendlyAuthError(e));
      }
    }
  }, []);

  const sendLink = useCallback(async (email) => {
    setError('');
    const clean = String(email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) {
      setError('Please type a valid email address, like name@gmail.com');
      return false;
    }
    try {
      await sendSignInLinkToEmail(auth, clean, { url: window.location.origin + '/', handleCodeInApp: true });
      try {
        localStorage.setItem(EMAIL_KEY, clean);
      } catch {
        /* ignore */
      }
      return true;
    } catch (e) {
      setError(friendlyAuthError(e));
      return false;
    }
  }, []);

  const logout = useCallback(() => signOut(auth), []);

  const value = useMemo(() => {
    let status = 'loading';
    if (fbUser === null) status = 'signedOut';
    else if (fbUser && denied) status = 'noAccess';
    else if (fbUser && profile) status = 'ready';
    return {
      status,
      linkBusy,
      fbUser,
      profile,
      role: profile?.role,
      isOwner: profile?.role === 'owner',
      name: profile?.name || fbUser?.displayName || '',
      error,
      setError,
      signInGoogle,
      sendLink,
      logout,
    };
  }, [fbUser, profile, denied, error, linkBusy, signInGoogle, sendLink, logout]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function friendlyAuthError(e) {
  const c = e?.code || '';
  if (c === 'auth/unauthorized-domain') return 'This website address is not yet allowed in Firebase (Authentication → Settings → Authorized domains). See the setup guide, step 5.';
  if (c === 'auth/operation-not-allowed') return 'This sign-in method is not turned on in Firebase yet. See the setup guide, step 4.';
  if (c === 'auth/network-request-failed') return 'No internet connection. Please try again when you are online.';
  if (c === 'auth/invalid-action-code' || c === 'auth/expired-action-code') return 'That sign-in link has expired or was already used. Please request a new one.';
  if (c === 'auth/invalid-email') return 'That email address does not look right.';
  if (c === 'auth/too-many-requests') return 'Too many tries. Please wait a few minutes and try again.';
  if (c === 'permission-denied') return 'You do not have permission to do that.';
  return e?.message || 'Something went wrong. Please try again.';
}

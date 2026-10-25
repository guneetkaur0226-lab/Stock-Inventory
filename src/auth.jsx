import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
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
import { doc, onSnapshot, getDoc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase.js';
import { OWNER_EMAIL, isOwnerUser } from './lib/owner.js';

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
  // The server decides which role is allowed. The owner e-mail only ever asks for "owner"
  // (never "staff"), everyone else only asks for "staff"; if the owner e-mail is not known
  // to the app, "owner" is tried first so the owner can never end up saved as staff.
  const roles = isOwnerUser(user) ? ['owner'] : OWNER_EMAIL ? ['staff'] : ['owner', 'staff'];
  // One short retry: a brand-new invite or sign-in can take a moment to be recognised by the server.
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 1500));
    for (const role of roles) {
      try {
        await setDoc(doc(db, 'users', user.uid), { email, name, role, createdAt: serverTimestamp() });
        return true;
      } catch (e) {
        if (e.code !== 'permission-denied') throw e;
      }
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
  const fbUserRef = useRef(null);
  const lastUid = useRef(undefined);

  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        fbUserRef.current = u;
        const uid = u ? u.uid : null;
        // Only start over when a different person signs in/out. Repeated events for the
        // same person (token refresh, redirect return) must not blank the screen.
        if (lastUid.current !== uid) {
          lastUid.current = uid;
          setProfile(undefined);
          setDenied(false);
        }
        setFbUser(u);
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

  // Watch this person's profile document. Staff get their role from it. The owner's role
  // comes from the sign-in (see `value` below), so this only keeps the owner's record tidy.
  const uid = fbUser?.uid;
  useEffect(() => {
    const user = fbUserRef.current;
    if (!uid || !user) return undefined;
    const amOwner = isOwnerUser(user);
    let registering = false;
    let repaired = false;
    const unsub = onSnapshot(
      doc(db, 'users', uid),
      // includeMetadataChanges: a first answer from the phone's cache ("no profile") is followed by the
      // server's answer even when that answer is the same. Without this the app could wait forever.
      { includeMetadataChanges: true },
      (snap) => {
        if (snap.exists()) {
          const d = snap.data();
          if (amOwner && d.role !== 'owner') {
            // An older version could save the owner as "staff". The owner may delete that record,
            // and the empty-record branch below then saves the correct owner record.
            if (!repaired && !snap.metadata.fromCache) {
              repaired = true;
              deleteDoc(snap.ref).catch(() => {});
            }
            return;
          }
          setProfile((prev) => (prev && prev.uid === uid && prev.role === d.role && prev.name === d.name && prev.email === d.email ? prev : { uid, ...d }));
          setDenied(false);
          return;
        }
        if (snap.metadata.fromCache) return; // wait for the server's answer
        if (registering) return;
        registering = true;
        register(fbUserRef.current || user)
          .then((ok) => !ok && setDenied(true))
          .catch((e) => setError(friendlyAuthError(e)))
          .finally(() => {
            registering = false;
          });
      },
      (e) => {
        setError(friendlyAuthError(e));
        setDenied(true); // never leave the person on the loading screen
      }
    );
    return unsub;
  }, [uid]);

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

  const ownerByEmail = isOwnerUser(fbUser);
  const fbEmail = (fbUser?.email || '').toLowerCase();
  const fbName = fbUser?.displayName || '';

  // The owner is recognised straight from the verified sign-in, so the Owner view appears at once
  // and cannot flip to Staff. Staff wait for their profile record.
  const effectiveProfile = useMemo(() => {
    if (!uid) return undefined;
    if (ownerByEmail) return { uid, email: fbEmail, name: (fbName || fbEmail.split('@')[0] || 'Owner').slice(0, 80), role: 'owner' };
    return profile || undefined;
  }, [uid, ownerByEmail, fbEmail, fbName, profile]);

  const value = useMemo(() => {
    let status = 'loading';
    if (fbUser === null) status = 'signedOut';
    else if (fbUser && ownerByEmail) status = 'ready';
    else if (fbUser && effectiveProfile) status = 'ready';
    else if (fbUser && denied) status = 'noAccess';
    const role = effectiveProfile?.role;
    return {
      status,
      linkBusy,
      fbUser,
      profile: effectiveProfile,
      role,
      isOwner: role === 'owner',
      name: effectiveProfile?.name || fbName,
      error,
      setError,
      signInGoogle,
      sendLink,
      logout,
    };
  }, [fbUser, effectiveProfile, ownerByEmail, denied, error, linkBusy, fbName, signInGoogle, sendLink, logout]);

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

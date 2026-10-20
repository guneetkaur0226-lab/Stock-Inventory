// The owner's e-mail, baked in at BUILD time from the Vercel variable OWNER_EMAIL
// (see vite.config.js). It is an address, not a secret, and the real protection is
// firestore.rules, which checks the same address on the server.
// Empty string = not configured (the app then falls back to the saved profile role).
/* global __OWNER_EMAIL__ */
export const OWNER_EMAIL = (typeof __OWNER_EMAIL__ === 'string' ? __OWNER_EMAIL__ : '').trim().toLowerCase();

/** True only for the verified owner account. Decided from the sign-in itself, never from a database round-trip. */
export const isOwnerUser = (u) => Boolean(OWNER_EMAIL && u && u.emailVerified === true && String(u.email || '').toLowerCase() === OWNER_EMAIL);

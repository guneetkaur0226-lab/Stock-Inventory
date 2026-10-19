// Turn Firebase errors into plain language.
export function friendly(err) {
  const code = err?.code || '';
  if (code.includes('permission-denied')) return 'Not allowed: the server refused this change. If you were just removed or this is a new setup, sign out and in again.';
  if (code.includes('unavailable') || code.includes('network')) return 'No internet connection right now.';
  if (code.includes('resource-exhausted')) return 'The free daily limit of the database was reached. It resets every day; try again tomorrow.';
  if (code.includes('unauthenticated')) return 'You are signed out. Please sign in again.';
  if (code.includes('popup-closed-by-user') || code.includes('cancelled-popup-request')) return 'Sign-in was cancelled.';
  if (code.includes('popup-blocked')) return 'The sign-in pop-up was blocked. Allow pop-ups for this site and try again.';
  if (code.includes('invalid-email')) return 'That e-mail address does not look right.';
  if (code.includes('expired-action-code')) return 'That sign-in link has expired. Ask for a new one.';
  if (code.includes('invalid-action-code')) return 'That sign-in link was already used or is not valid. Ask for a new one.';
  if (code.includes('unauthorized-domain')) return 'This website address is not authorised in Firebase yet (Authentication → Settings → Authorised domains).';
  if (code.includes('operation-not-allowed')) return 'This sign-in method is not switched on in Firebase yet.';
  if (code.includes('too-many-requests')) return 'Too many attempts. Wait a few minutes and try again.';
  return err?.message || 'Something went wrong. Please try again.';
}

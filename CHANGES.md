# Changes in this update

## 1. Purge old history (owner only)
* New screen: **More → Purge old history** (`src/screens/PurgeHistory.jsx`, helpers in `src/db.js`).
* Deletes only documents in the `movements` (history) collection. `items`, `suppliers`, `prices` are never queried for deletion.
* Safety: only entries older than 60 days / 90 days / 6 months / 1 year; you must type PURGE; confirmation dialog; each item's latest history entry is always kept; optional CSV backup button; at most ~5,000 deletions per run (free-plan daily limits).
* Server-side enforcement (`firestore.rules`): only the owner may delete a movement, and only if it is older than 30 days. Staff cannot, even by calling Firestore directly.

## 2. Suppliers
* **Count fixed:** the number now counts stock items whose per-supplier breakdown (`bySupplier`) contains that supplier (matching ignores case/spacing). Before, it counted price-list rows, so suppliers with no saved prices showed 0. The opened card now lists those items and quantities.
* Suppliers that only appear on stock items (no supplier record, no prices) now show up too.
* **Delete supplier** (owner): confirmation dialog stating how many items and prices are affected. Stock items and quantities are kept; the supplier name is removed from those items (quantity shows as "Other") with one EDIT history entry per item; the supplier's saved prices and the supplier record are deleted. Old history entries are untouched. Safe to retry if interrupted.
* `firestore.rules`: an owner EDIT may now remove entries from an item's `bySupplier` (never add or change one; quantity must stay equal).

## 3. Staff invitation email
* Root cause: "Send invite" only wrote an `invites` document; there was no code that sent an email.
* New Vercel function `api/send-invite.js` (+ `api/_invite.js`): verifies the caller's Firebase login is the owner, then emails the staff member the app link (SMTP via `nodemailer`). Link = `APP_URL`, else Vercel production domain, else the request origin.
* Staff screen: sends after saving the invite, shows the link if mail fails (invite still works), **Resend** button on pending invites.
* `vercel.json`: SPA rewrite no longer captures `/api/*`. `vite.config.js`: service worker never serves the app shell for `/api/*`.
* `package.json`: added `nodemailer`. `npm test` now also runs `scripts/invite-selftest.mjs`.

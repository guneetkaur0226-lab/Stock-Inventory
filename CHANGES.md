# Changes: "Staff" is now "Member" in the app

* All screen text, the invite page and the docs say **Member** instead of Staff. Internally the saved role value stays `staff` (database, rules, existing users), so nobody loses access and no migration is needed.
* **Access check**: only invited members (and the owner) see the app. Anyone else gets the "No access" page. If a member is removed while the app is open, they are sent to "No access" instead of keeping the old screen.
* No rules change needed.

# Changes: staff login fixes

* **Stuck on "Starting…"**: the profile listener now also hears the server's confirmation when the phone's cache says "no profile yet" (`includeMetadataChanges`), retries the profile creation once, and a listener error shows the "No access" screen with the reason instead of loading forever. If loading takes over 12 seconds, a *Try again* / *Sign out* screen appears.
* **Flicker between "No access" and Home**: once a profile exists it always wins over an earlier "denied" state.
* No rules change needed.

# Changes: Purge history can delete everything

* **More → Purge old history**: new tick box **"Also delete each item's latest history entry"** (off by default) and a new range **"All history"**. With the box ticked nothing in the chosen range is kept. Stock, items and suppliers are never touched; stock changes keep working afterwards. No rules change needed (the owner could already delete any history entry).

# Changes: History filters + staff access to Suppliers

**Publish the updated `firestore.rules`.**

* **History → Filters**: staff member, supplier, item, location (also matches where a move went), date (today / 7 / 30 days / custom range) plus the existing action buttons (IN / OUT / Moved) and search. All filters work together. The date range is applied by the server, so it reaches older entries. History records are never changed.
* **Staff can use the Suppliers tab**: view and search, set/view locations and quantities, IN / OUT / Move, add and edit suppliers, change supplier-item-location links (staff can remove only empty, 0-quantity links). Staff still cannot delete suppliers, items or history, cannot purge history, and cannot change owner/admin settings (all enforced in `firestore.rules`). Prices stay owner-only.

# Changes: Locations (Supplier → Item → Location → Quantity)

**Publish the updated `firestore.rules` BEFORE (or together with) deploying the app.** No data migration is needed.

* **New collection `locStock`**: one small document per Supplier + Item + Location holding its quantity. Location is never stored on the item. Items keep their total `qty` and `bySupplier` exactly as before, so all existing data works unchanged. Stock a supplier already holds with no location shows as **"No location set"** until it is given a location (Suppliers tab → *Set location*, owner only).
* **Locations**: the 8 predefined Godown / Mayapuri Shop locations (`src/lib/locations.js`, same list in `firestore.rules`).
* **Suppliers tab** (`src/screens/Suppliers.jsx`): Item → Location → Quantity → IN / OUT (− / + or typed quantity) per row; each row updates only its own Supplier + Item + Location quantity and writes a History entry. *Add price* and *Compare by item* removed. Every item shows **Supplier Stock** and **Total Item Stock**. Search matches supplier name or item name.
* **Add / edit supplier**: name required; address and description optional; pick existing items, each with one or more locations. Quantities are added with IN / OUT so History explains them. The supplier name is still read-only when editing.
* **Move** (new history type "MOVED"): move quantity between locations; total stock does not change.
* **Stock tab**: IN can store at a location when a supplier is chosen; OUT "Taken from" lists supplier + location. "Any / not sure" only takes stock that is not tied to a location. New item form has an optional location for opening stock.
* Deleting an item or supplier also removes its location rows (item totals are kept for suppliers, as before). History CSV has a new last column, Location.
* Old prices data, price import/export and the Prices collection are untouched (only the Suppliers-tab screens were removed).
* `npm test` also runs `scripts/locstock-selftest.mjs`.

# Changes in the latest update

* **Owner/Staff switching fixed** (`src/auth.jsx`, `src/lib/owner.js`, `vite.config.js`): the Owner view is decided from the verified sign-in email compared with `OWNER_EMAIL` (read at build time), not from a saved database record, so it cannot flip. The owner is never saved as "staff" any more, and an old wrong record is repaired automatically.
* **Purge history by date range** (`src/screens/PurgeHistory.jsx`, `src/db.js`, `firestore.rules`): Last day / 7 days / 30 days, older than 60 d / 90 d / 6 m / 1 y, or a custom date range. Only history entries inside the range are deleted; items, suppliers, prices and each item's latest history entry are kept. **Publish the updated `firestore.rules`** (the old 30-day minimum was removed).
* **Suppliers tab**: stock items per supplier use a fixed two-line row (name, part no.) with the quantity in its own column.
* **Staff invite email**: Gmail App Password support (spaces/quotes removed, clearer errors, timeouts); `SMTP_USER` falls back to `OWNER_EMAIL`. New **Copy App URL** button in More -> Members & invites.
* `package-lock.json` re-synced (it was missing `nodemailer`).

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

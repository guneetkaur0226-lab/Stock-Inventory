# Mayapuri Stock

Mobile-first PWA stock book for a generator & motor parts shop. React + Vite, Firebase Auth + Firestore (free Spark plan), deployed on Vercel.

* **Setup (non-technical):** `docs/SETUP_GUIDE.md`
* **Testing:** `docs/TEST_CHECKLIST.md`
* **Security rules:** `firestore.rules` (set the owner email before publishing)
* Sample data: `sample-data/STOCK_MANAGEMENT_MAYAPURI.xlsx`

## Local development
```
npm install
cp .env.example .env     # fill the 6 VITE_FIREBASE_* values
npm run dev
npm test                 # importer + search self-tests
```

## How the data is stored
| Collection | Who can read | Who can write |
|---|---|---|
| `items` (name, partNo, brand, model, qty, unit, minQty, `bySupplier` map) | owner, staff | staff/owner: only via IN/OUT/new (with history); owner: edit, delete, import |
| `movements` (history) | owner, staff | create only; **never** update/delete |
| `suppliers` (names + note) | owner, staff | owner |
| `prices` (supplier price list) | **owner only** | owner |
| `users`, `invites` | owner (+ own profile) | owner invites/removes |

Each stock change is one atomic batch (item + history entry); the rules check the arithmetic, so stock cannot go below zero and history cannot be forged or skipped.

## Design notes / known limits
* Owner is identified by the verified email in `firestore.rules` (no server code needed on the free plan).
* Quantity is the source of truth; the per-supplier breakdown is informational (anything not assigned shows as "Other").
* If two phones change the same item while one is offline, the later write is refused by the server and the app shows a "NOT SAVED" message; re-enter it.
* Staff can see supplier **names** and per-supplier stock quantities (stock data) but never prices.
* Import uses SheetJS `xlsx` 0.18.5; only the owner imports, and only their own files.
* Rules were reviewed by hand and via the checklist; run the Rules Playground checks in the test list after publishing.

# Test checklist

Use the owner's phone (A) and a staff phone (B). Tick each line.

## 1. Staff entries appear on the owner's phone
- [ ] Staff (B) opens an item → **Stock OUT** 1 → Save. Owner (A) sees the new quantity **within a few seconds** without refreshing.
- [ ] Staff adds a new item "TEST ITEM" with opening stock 10. It appears on A.
- [ ] On A, **History** shows both entries with staff name, date/time, quantity, "left" stock, note.
- [ ] Staff tries OUT larger than stock → red message, cannot save.
- [ ] Item at or below its alert level (or 0) shows orange "Low stock / Out of stock" and appears under **Low / out**.

## 2. Staff are blocked from owner things
- [ ] Staff phone has **no Suppliers tab**; More has **no Import / Export / Staff** rows; no Edit/Delete in an item.
- [ ] *Server check:* in Firebase console → Firestore → **Rules → Rules playground**, simulate **get** on `/prices/test` signed in as a staff user → **Denied**. (Or: staff signed-in phone never shows prices.)
- [ ] Staff cannot see "History CSV download".

## 3. History cannot be edited
- [ ] No edit/delete button exists anywhere on History.
- [ ] Rules playground: simulate **update** and **delete** on `/movements/anyid` as the **owner** → **Denied**.
- [ ] Owner deletes "TEST ITEM": item disappears, History still shows its entries plus a "DELETED" entry.

## 4. Import
- [ ] More → Import → Stock → `STOCK_MANAGEMENT_MAYAPURI.xlsx` → preview "25 new, 0 skipped, 0 invalid" with 5 supplier columns.
- [ ] Confirm. Items appear. Item "Silencer Mahindra DI" shows 96 pcs, "Arjun: 96".
- [ ] Import the same file again → "0 new, 25 skipped".
- [ ] Import a file with a bad row (blank name, or quantity "abc") → counted as **invalid** with a reason, not imported.
- [ ] Sheet with more than 500 rows → blocked with a clear message.
- [ ] Supplier prices: import a sheet (Supplier, Item, Part No, Rate) → "N new". Change one rate and import again → "1 price changed"; the price list shows "was ₹…". Import again unchanged → all skipped.
- [ ] Download **template** from Import or Export screen.

## 5. Export
- [ ] More → Export → Stock CSV and Excel open in Excel; headings: Name, Part No, Brand, Model, Qty, Unit, Min Stock + one column per supplier.
- [ ] Supplier prices CSV; History CSV (also from the History tab).
- [ ] Import the exported Stock file back → everything "skipped" (already exists).

## 6. Offline
- [ ] Install app. Turn on **Airplane mode**. Open the app: stock list still shows. Record an OUT → header says "Offline · 1 waiting".
- [ ] Turn internet back on → "Synced"; the owner's phone shows the change.

## 7. Staff management
- [ ] Owner invites staff Gmail → staff signs in → works.
- [ ] Owner **Remove** → staff phone shows "No access" / cannot load data.
- [ ] A Gmail that was never invited sees "No access".

## 8. Suppliers (owner)
- [ ] Add price Arjun / Silencer 407 / ₹1,250 and Sanjay / Silencer 407 / ₹1,180.50. **Compare by item** "silencer 407" shows both, cheapest marked **Lowest**.
- [ ] Search supplier "arjun" lists all his items with prices. Typing suggests existing supplier / item names.
- [ ] Edit a price → shows "was ₹…".

## 9. Look and feel
- [ ] More → Appearance: Light / Dark / Auto all readable.
- [ ] Dates look like `19 Oct`, money like `₹1,25,000`.

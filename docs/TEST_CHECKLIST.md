# Test checklist

Use the owner's phone (A) and a staff phone (B). Tick each line.

## 1. Staff entries appear on the owner's phone
- [ ] Staff (B) opens an item → **Stock OUT** 1 → Save. Owner (A) sees the new quantity **within a few seconds** without refreshing.
- [ ] Staff adds a new item "TEST ITEM" with opening stock 10. It appears on A.
- [ ] On A, **History** shows both entries with staff name, date/time, quantity, "left" stock, note.
- [ ] Staff tries OUT larger than stock → red message, cannot save.
- [ ] Item at or below its alert level (or 0) shows orange "Low stock / Out of stock" and appears under **Low / out**.

## 2. Staff are blocked from owner things
- [ ] Staff phone has the Suppliers tab (no Delete supplier button, no prices); More has **no Import / Export / Staff** rows; no Edit/Delete in an item.
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


## 9. Purge old history (owner only)
- [ ] Staff phone: More has **no** "Purge old history" row.
- [ ] Owner: More → Purge old history shows total and "older than …" counts; **Delete old history** stays greyed out until you type PURGE.
- [ ] Choosing 60 days with only recent test data shows 0 old entries (nothing can be deleted).
- [ ] After a purge, the Stock tab and every quantity are unchanged; History only lost the old entries; each item still has its latest entry.
- [ ] Rules Playground: delete `movements/<id>` as a staff user → **denied**; as owner on an entry newer than 30 days → **denied**.

## 10. Suppliers: count and delete (owner)
- [ ] A supplier that has stock items shows the right "N items" (not 0) and lists them when opened.
- [ ] **Delete supplier** asks for confirmation naming the number of items and prices.
- [ ] After deleting: the supplier is gone, its stock items still exist with the same quantity (shown as "Other"), its prices are gone, History shows an EDIT line per affected item.

## 11. Invitation email
- [ ] Owner: Staff & invites → Send invite → toast says the email was sent; the staff member receives a mail whose button opens the Vercel app address.
- [ ] Pending invite → **Resend** sends it again. Staff phone cannot call the function (returns "Only the owner…").

## Locations (Supplier → Item → Location → Quantity)
- [ ] Suppliers → open a supplier that already had stock: its quantity shows under "No location set"; item total unchanged.
- [ ] *Set location* moves part/all of it to e.g. Godown → Ground Floor. Total and Supplier Stock stay the same; History shows "Moved".
- [ ] IN 5 / OUT 2 on a location row changes only that row, Supplier Stock and Total Item Stock; History shows the location.
- [ ] Same item at two locations for one supplier: two separate rows. Same item under two suppliers: Total Item Stock counts both.
- [ ] OUT larger than the row's quantity is refused. Stock tab "Any / not sure" cannot take located stock.
- [ ] Search by supplier name and by item name; searched item shows both quantities.
- [ ] Add supplier: name required; address/description optional; adding a duplicate name is refused.
- [ ] Rules playground: staff update of `/locStock/x` without a matching movement → Denied.

## History filters / staff on Suppliers
- [ ] History → Filters: choose staff + supplier + item + location + custom dates together; only matching entries remain. Clear all filters restores the list.
- [ ] Staff: Suppliers tab opens; can add/edit a supplier, set a location, IN / OUT / Move. No Delete supplier button.
- [ ] Staff: Rules playground delete of `/suppliers/x`, `/items/x`, `/movements/x` → Denied. Delete of a `/locStock` row with quantity above 0 → Denied.

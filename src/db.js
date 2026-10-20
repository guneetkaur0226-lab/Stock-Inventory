// All writes. Each stock change is ONE batch: the item update + its history
// entry are saved together or not at all. The security rules re-check every
// number on the server.
import {
  collection,
  doc,
  writeBatch,
  serverTimestamp,
  deleteField,
  FieldPath,
  getDocs,
  query,
  orderBy,
  limit,
  startAfter,
  setDoc,
  deleteDoc,
  where,
  Timestamp,
  getCountFromServer,
} from 'firebase/firestore';
import { auth, db } from './firebase.js';
import { INTEGER_UNITS, round3, clean, slug, priceId } from './lib/text.js';

// ----------------------------------------------------------------- helpers
export function buckets(item) {
  const by = item.bySupplier || {};
  const sum = Object.values(by).reduce((a, b) => a + (Number(b) || 0), 0);
  return { by, unassigned: Math.max(0, round3(item.qty - sum)) };
}

const findKey = (by, name) => Object.keys(by).find((k) => k.toLowerCase() === name.toLowerCase()) || name;

/** Which supplier "pot" does an OUT take from? */
function allocateOut(item, qty, chosen) {
  const { by, unassigned } = buckets(item);
  const changes = {}; // supplierName -> new quantity
  if (chosen) {
    const k = findKey(by, chosen);
    changes[k] = round3((by[k] || 0) - qty);
    return changes;
  }
  let left = qty;
  left = round3(left - Math.min(left, unassigned)); // unassigned stock goes first
  const order = Object.entries(by)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
  for (const [k, v] of order) {
    if (left <= 0) break;
    const take = Math.min(v, left);
    changes[k] = round3(v - take);
    left = round3(left - take);
  }
  return changes;
}

/** Returns an error message, or '' when the movement is fine. */
export function validateMove(item, type, qty, supplier) {
  if (!Number.isFinite(qty) || qty <= 0) return 'Enter a quantity greater than 0.';
  if (INTEGER_UNITS.includes(item.unit) && !Number.isInteger(qty)) return `Quantity must be a whole number for ${item.unit}.`;
  if (Math.round(qty * 1000) / 1000 !== qty) return 'Use at most 3 decimal places.';
  if (qty > 1000000) return 'That quantity is too large.';
  if (type === 'OUT') {
    if (qty > item.qty) return `Only ${item.qty} ${item.unit} in stock. You cannot take out ${qty}.`;
    if (supplier) {
      const { by } = buckets(item);
      const have = by[findKey(by, supplier)] || 0;
      if (qty > have) return `Only ${have} ${item.unit} recorded under ${supplier}. Choose "Any / not sure" or a smaller quantity.`;
    }
  }
  return '';
}

const mvBase = (user, item, type, qty, stockAfter, note, supplier) => ({
  itemId: item.id,
  itemName: item.name,
  partNo: item.partNo || '',
  type,
  qty,
  stockAfter,
  unit: item.unit,
  note: clean(note, 300),
  supplier: clean(supplier, 80),
  by: user.uid,
  byName: (user.name || user.email || 'User').slice(0, 80),
  at: serverTimestamp(),
});

// --------------------------------------------------------------- stock IN/OUT
/**
 * Records stock IN or OUT. Does NOT wait for the server (so it works offline);
 * returns a promise that resolves when the server accepted it, or rejects
 * (for example if stock changed on another phone meanwhile).
 */
export function recordStock({ item, type, qty, supplier = '', note = '', user }) {
  const err = validateMove(item, type, qty, supplier);
  if (err) throw new Error(err);
  const newQty = round3(type === 'IN' ? item.qty + qty : item.qty - qty);

  const itemRef = doc(db, 'items', item.id);
  const moveRef = doc(collection(db, 'movements'));
  const args = ['qty', newQty, 'lastMoveId', moveRef.id, 'updatedAt', serverTimestamp(), 'updatedBy', user.uid];

  let supLabel = supplier;
  if (type === 'IN') {
    if (supplier) {
      const { by } = buckets(item);
      const k = findKey(by, supplier);
      args.push(new FieldPath('bySupplier', k), round3((by[k] || 0) + qty));
      supLabel = k;
    }
  } else {
    const changes = allocateOut(item, qty, supplier);
    for (const [k, v] of Object.entries(changes)) args.push(new FieldPath('bySupplier', k), v > 0 ? v : deleteField());
    if (!supplier) supLabel = Object.keys(changes).length === 1 ? Object.keys(changes)[0] : '';
  }

  const batch = writeBatch(db);
  batch.update(itemRef, ...args);
  batch.set(moveRef, mvBase(user, item, type, qty, newQty, note, supLabel));
  return batch.commit();
}

// ------------------------------------------------------------------ new item
export function addItem({ data, supplier = '', note = '', user }) {
  const itemRef = doc(collection(db, 'items'));
  const moveRef = doc(collection(db, 'movements'));
  const qty = round3(data.qty || 0);
  const sup = clean(supplier, 80);
  const item = {
    name: clean(data.name, 120),
    partNo: clean(data.partNo, 60),
    brand: clean(data.brand, 60),
    model: clean(data.model, 120),
    qty,
    unit: data.unit,
    minQty: round3(data.minQty || 0),
    bySupplier: sup && qty > 0 ? { [sup]: qty } : {},
    lastMoveId: moveRef.id,
    createdAt: serverTimestamp(),
    createdBy: user.uid,
    updatedAt: serverTimestamp(),
    updatedBy: user.uid,
  };
  const batch = writeBatch(db);
  batch.set(itemRef, item);
  batch.set(moveRef, mvBase(user, { id: itemRef.id, ...item }, 'NEW', qty, qty, note || 'New item added', sup));
  return batch.commit();
}

// ----------------------------------------------------------- edit / delete (owner)
const LABELS = { name: 'Name', partNo: 'Part no.', brand: 'Brand', model: 'Model', unit: 'Unit', minQty: 'Min stock' };

export function editItem({ item, data, user }) {
  const changes = {};
  const notes = [];
  for (const k of Object.keys(LABELS)) {
    const nv = k === 'minQty' ? round3(data[k] || 0) : clean(data[k], k === 'name' || k === 'model' ? 120 : 60);
    if (nv !== item[k]) {
      changes[k] = nv;
      notes.push(`${LABELS[k]}: ${item[k] || '—'} → ${nv || '—'}`);
    }
  }
  if (!notes.length) return null;
  const itemRef = doc(db, 'items', item.id);
  const moveRef = doc(collection(db, 'movements'));
  const batch = writeBatch(db);
  batch.update(itemRef, { ...changes, lastMoveId: moveRef.id, updatedAt: serverTimestamp(), updatedBy: user.uid });
  batch.set(moveRef, mvBase(user, { ...item, ...changes }, 'EDIT', 0, item.qty, notes.join('; '), ''));
  return batch.commit();
}

export function deleteItem({ item, user }) {
  const moveRef = doc(collection(db, 'movements'));
  const batch = writeBatch(db);
  batch.delete(doc(db, 'items', item.id));
  batch.set(moveRef, mvBase(user, item, 'DELETE', item.qty, 0, 'Item deleted', ''));
  return batch.commit();
}

// --------------------------------------------------------------------- import
const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

export async function importStock({ rows, user, existingSupplierIds, onProgress }) {
  const names = new Set();
  rows.forEach((r) => Object.keys(r.bySupplier).forEach((n) => names.add(n)));
  let done = 0;
  for (const part of chunk(rows, 200)) {
    const batch = writeBatch(db);
    for (const r of part) {
      const itemRef = doc(collection(db, 'items'));
      const moveRef = doc(collection(db, 'movements'));
      const item = {
        name: r.name,
        partNo: r.partNo,
        brand: r.brand,
        model: r.model,
        qty: r.qty,
        unit: r.unit,
        minQty: r.minQty,
        bySupplier: r.bySupplier,
        lastMoveId: moveRef.id,
        createdAt: serverTimestamp(),
        createdBy: user.uid,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      };
      batch.set(itemRef, item);
      batch.set(moveRef, mvBase(user, { id: itemRef.id, ...item }, 'NEW', r.qty, r.qty, 'Imported from file', ''));
    }
    await batch.commit();
    done += part.length;
    onProgress?.(done, rows.length);
  }
  const newSuppliers = [...names].filter((n) => !existingSupplierIds.has(slug(n)));
  if (newSuppliers.length) {
    const batch = writeBatch(db);
    newSuppliers.forEach((n) => batch.set(doc(db, 'suppliers', slug(n)), { name: n, note: '', updatedAt: serverTimestamp() }));
    await batch.commit();
  }
}

export async function importSuppliers({ rows, onProgress }) {
  let done = 0;
  for (const part of chunk(rows, 400)) {
    const batch = writeBatch(db);
    part.forEach((r) => batch.set(doc(db, 'suppliers', r.id), { name: r.name, note: r.note, updatedAt: serverTimestamp() }));
    await batch.commit();
    done += part.length;
    onProgress?.(done, rows.length);
  }
}

export async function importPrices({ rows, user, existingSupplierIds, onProgress }) {
  let done = 0;
  for (const part of chunk(rows, 400)) {
    const batch = writeBatch(db);
    part.forEach((r) =>
      batch.set(doc(db, 'prices', r.id), {
        supplier: r.supplier,
        item: r.item,
        partNo: r.partNo,
        price: r.price,
        unit: r.unit,
        note: r.note,
        prevPrice: r.prevPrice ?? null,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      })
    );
    await batch.commit();
    done += part.length;
    onProgress?.(done, rows.length);
  }
  const fresh = new Map();
  rows.forEach((r) => !existingSupplierIds.has(slug(r.supplier)) && fresh.set(slug(r.supplier), r.supplier));
  if (fresh.size) {
    const batch = writeBatch(db);
    fresh.forEach((name, id) => batch.set(doc(db, 'suppliers', id), { name, note: '', updatedAt: serverTimestamp() }));
    await batch.commit();
  }
}

// ---------------------------------------------------------- supplier prices
export async function savePrice({ original, data, user, existingSupplierIds }) {
  const id = priceId(data.supplier, data.item, data.partNo);
  const body = {
    supplier: clean(data.supplier, 80),
    item: clean(data.item, 120),
    partNo: clean(data.partNo, 60),
    price: Math.round(data.price * 100) / 100,
    unit: data.unit,
    note: clean(data.note, 200),
    prevPrice: original ? (original.price !== data.price ? original.price : original.prevPrice ?? null) : null,
    updatedAt: serverTimestamp(),
    updatedBy: user.uid,
  };
  const batch = writeBatch(db);
  batch.set(doc(db, 'prices', id), body);
  if (original && original.id !== id) batch.delete(doc(db, 'prices', original.id));
  if (!existingSupplierIds.has(slug(body.supplier))) {
    batch.set(doc(db, 'suppliers', slug(body.supplier)), { name: body.supplier, note: '', updatedAt: serverTimestamp() });
  }
  await batch.commit();
  return id;
}

export const deletePrice = (id) => deleteDoc(doc(db, 'prices', id));

export function saveSupplier({ id, name, note }) {
  const cleaned = clean(name, 80);
  return setDoc(doc(db, 'suppliers', id || slug(cleaned)), { name: cleaned, note: clean(note, 200), updatedAt: serverTimestamp() });
}

// -------------------------------------------------------------- staff (owner)
export function inviteStaff({ name, email }) {
  return setDoc(doc(db, 'invites', email.toLowerCase()), { name: clean(name, 80), role: 'staff', invitedAt: serverTimestamp() });
}

/**
 * Asks the server (Vercel function /api/send-invite) to email the staff member
 * the app link. The function re-checks that the caller is the owner.
 * Resolves with { ok: true, appUrl }; rejects with an Error whose message is
 * safe to show (and `appUrl`, when known, so the link can be shared by hand).
 */
export async function sendInviteEmail({ name, email }) {
  const user = auth?.currentUser;
  if (!user) throw new Error('You are signed out. Please sign in again.');
  let res;
  try {
    const token = await user.getIdToken();
    res = await fetch('/api/send-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name, email }),
    });
  } catch {
    throw new Error('Could not reach the server. Check your internet and try again.');
  }
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* not JSON: e.g. running locally with "npm run dev", where /api does not exist */
  }
  if (!res.ok || !data.ok) {
    const err = new Error(data.error || 'The email service is not available here. It works on the deployed Vercel site.');
    err.appUrl = data.appUrl || '';
    throw err;
  }
  return data;
}

export async function removeStaff({ uid, email }) {
  if (uid) await deleteDoc(doc(db, 'users', uid));
  await deleteDoc(doc(db, 'invites', email.toLowerCase()));
}

// ------------------------------------------------------------------- history
/** Reads ALL history (for CSV export), 1000 at a time. */
export async function fetchAllMovements(onProgress) {
  const out = [];
  let last = null;
  for (;;) {
    const q = query(collection(db, 'movements'), orderBy('at', 'desc'), ...(last ? [startAfter(last)] : []), limit(1000));
    const snap = await getDocs(q);
    snap.docs.forEach((d) => out.push({ id: d.id, ...d.data() }));
    onProgress?.(out.length);
    if (snap.docs.length < 1000) break;
    last = snap.docs[snap.docs.length - 1];
  }
  return out;
}

// ------------------------------------------------- delete a supplier (owner)
/**
 * Deletes a supplier WITHOUT deleting any stock.
 *  1. Every stock item that lists this supplier gets the supplier tag removed
 *     (only the `bySupplier.<name>` field; quantity is never touched, so the
 *     quantity simply shows as "Other"). Each such item gets one EDIT history
 *     entry so the change is visible in History.
 *  2. The supplier's saved prices are deleted.
 *  3. The supplier record is deleted.
 * Steps are ordered so a failure part-way is safe to retry.
 */
export async function deleteSupplier({ name, docIds = [], items, prices, user, onProgress }) {
  const target = slug(name);
  const holders = [];
  for (const item of items) {
    const keys = Object.keys(item.bySupplier || {}).filter((k) => slug(k) === target);
    if (keys.length) holders.push({ item, keys });
  }
  const myPrices = prices.filter((p) => slug(p.supplier) === target);
  const total = holders.length + myPrices.length + 1;
  let done = 0;

  // 1) strip the supplier tag from stock items (8 per batch: the security rules
  //    allow at most 20 document look-ups per batch, and each item needs 2)
  for (const part of chunk(holders, 8)) {
    const batch = writeBatch(db);
    for (const { item, keys } of part) {
      const moveRef = doc(collection(db, 'movements'));
      const args = [];
      keys.forEach((k) => args.push(new FieldPath('bySupplier', k), deleteField()));
      args.push('lastMoveId', moveRef.id, 'updatedAt', serverTimestamp(), 'updatedBy', user.uid);
      batch.update(doc(db, 'items', item.id), ...args);
      batch.set(moveRef, mvBase(user, item, 'EDIT', 0, item.qty, `Supplier "${name}" deleted: removed from this item (stock quantity unchanged)`, ''));
    }
    await batch.commit();
    done += part.length;
    onProgress?.(done, total);
  }

  // 2) the supplier's price list
  for (const part of chunk(myPrices, 400)) {
    const batch = writeBatch(db);
    part.forEach((p) => batch.delete(doc(db, 'prices', p.id)));
    await batch.commit();
    done += part.length;
    onProgress?.(done, total);
  }

  // 3) the supplier record(s) themselves
  const ids = new Set([...docIds, target]);
  const batch = writeBatch(db);
  ids.forEach((id) => batch.delete(doc(db, 'suppliers', id)));
  await batch.commit();
  onProgress?.(total, total);
  return { itemsUpdated: holders.length, pricesDeleted: myPrices.length };
}

// ------------------------------------------------ purge old history (owner)
/** Entries newer than this many days can never be purged (also enforced in firestore.rules). */
export const PURGE_MIN_DAYS = 30;

/** How many history entries exist (optionally only those older than `olderThan`). Needs internet. */
export async function countHistory(olderThan) {
  const base = collection(db, 'movements');
  const q = olderThan ? query(base, where('at', '<', Timestamp.fromDate(olderThan))) : query(base);
  const snap = await getCountFromServer(q);
  return snap.data().count;
}

/**
 * Deletes history entries older than `olderThan`. Only the `movements`
 * collection is touched: items (current stock), suppliers and prices are not.
 * Ids in `keepIds` (each item's latest history entry) are skipped.
 * Stops after about `maxDocs` deletions (free-plan daily limits); run again to continue.
 */
export async function purgeHistory({ olderThan, keepIds = new Set(), maxDocs = 5000, onProgress }) {
  const newest = Date.now() - PURGE_MIN_DAYS * 86400000;
  if (!(olderThan instanceof Date) || olderThan.getTime() > newest) throw new Error(`Only entries older than ${PURGE_MIN_DAYS} days can be deleted.`);
  const cutoff = Timestamp.fromDate(olderThan);
  const PAGE = 400;
  let deleted = 0;
  let kept = 0;
  let cursor = null;
  let more = false;
  for (;;) {
    const q = query(collection(db, 'movements'), where('at', '<', cutoff), orderBy('at', 'asc'), ...(cursor ? [startAfter(cursor)] : []), limit(PAGE));
    const snap = await getDocs(q);
    if (snap.empty) break;
    const batch = writeBatch(db);
    let n = 0;
    for (const d of snap.docs) {
      if (keepIds.has(d.id)) kept += 1;
      else {
        batch.delete(d.ref);
        n += 1;
      }
    }
    if (n) await batch.commit();
    deleted += n;
    onProgress?.(deleted);
    cursor = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < PAGE) break;
    if (deleted >= maxDocs) {
      more = true;
      break;
    }
  }
  return { deleted, kept, more };
}

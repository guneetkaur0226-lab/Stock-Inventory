// All database writes live here. Every stock change is ONE atomic batch that writes
// the item change and its history entry together; the security rules check they match.

import {
  collection, doc, writeBatch, increment, serverTimestamp, FieldPath, setDoc, getDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import { slug, round3, clean } from './keys';

let reportAsync = () => {};
export const setErrorReporter = (fn) => { reportAsync = fn; };

/**
 * Commit a batch without freezing the screen when the phone is offline.
 * - online: wait for the server (up to 8 s) so errors can be shown immediately
 * - offline / slow: the write is saved on the phone and sent later; if the server
 *   refuses it later, the error reporter shows a warning.
 */
export function commit(batch, what = 'A change') {
  const p = batch.commit();
  const later = (e) => reportAsync(`${what} could not be saved to the server: ${e?.code?.includes('permission') ? 'not allowed' : e?.message || 'unknown error'}`);
  if (!navigator.onLine) {
    p.catch(later);
    return Promise.resolve({ queued: true });
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { p.catch(later); resolve({ queued: true }); }, 8000);
    p.then(() => { clearTimeout(timer); resolve({ queued: false }); },
      (e) => { clearTimeout(timer); reject(e); });
  });
}

const actor = (p) => ({ byUid: p.uid, byEmail: p.email, byName: p.name });

function historyDoc(profile, item, h) {
  return {
    itemId: item.id,
    itemName: String(item.name).slice(0, 120),
    partNo: item.partNo || '',
    type: h.type,
    delta: h.delta,
    stockAfter: h.stockAfter,
    unit: item.unit || '',
    supplier: (h.supplier || '').slice(0, 100),
    note: (h.note || '').slice(0, 300),
    details: (h.details || '').slice(0, 600),
    ...actor(profile),
    at: serverTimestamp(),
  };
}

// -------------------------------------------------------------------- stock

export function recordMove(profile, item, { type, qty, holderKey, holderName, note }) {
  const delta = round3(type === 'IN' ? qty : -qty);
  const hRef = doc(collection(db, 'history'));
  const iRef = doc(db, 'items', item.id);
  const b = writeBatch(db);
  const fields = [
    'qty', increment(delta),
    'updatedAt', serverTimestamp(),
    'updatedBy', profile.uid,
    'lastHistoryId', hRef.id,
  ];
  if (holderKey) {
    fields.push(new FieldPath('holders', holderKey, 'qty'), increment(delta));
    fields.push(new FieldPath('holders', holderKey, 'name'), holderName);
  }
  b.update(iRef, ...fields);
  b.set(hRef, historyDoc(profile, item, {
    type, delta, stockAfter: round3(item.qty + delta), supplier: holderKey ? holderName : '', note,
  }));
  return commit(b, `${type} entry for ${item.name}`);
}

export function createItem(profile, f) {
  const iRef = doc(collection(db, 'items'));
  const hRef = doc(collection(db, 'history'));
  const qty = round3(f.qty || 0);
  const supplier = clean(f.supplier);
  const data = {
    name: clean(f.name), partNo: clean(f.partNo), brand: clean(f.brand), model: clean(f.model),
    qty, unit: f.unit, minStock: round3(f.minStock || 0),
    createdAt: serverTimestamp(), createdBy: profile.uid,
    updatedAt: serverTimestamp(), updatedBy: profile.uid,
    lastHistoryId: hRef.id,
  };
  if (supplier && qty > 0) data.holders = { [slug(supplier)]: { name: supplier, qty } };
  const b = writeBatch(db);
  b.set(iRef, data);
  b.set(hRef, historyDoc(profile, { ...data, id: iRef.id }, {
    type: 'NEW', delta: qty, stockAfter: qty, supplier: supplier && qty > 0 ? supplier : '', note: f.note || '', details: 'New item added',
  }));
  return commit(b, `New item ${data.name}`);
}

const LABELS = { name: 'Name', partNo: 'Part no', brand: 'Brand', model: 'Model', unit: 'Unit', minStock: 'Min stock' };

export function editItem(profile, item, f) {
  const next = {
    name: clean(f.name), partNo: clean(f.partNo), brand: clean(f.brand), model: clean(f.model),
    unit: f.unit, minStock: round3(f.minStock || 0),
  };
  const changes = [];
  for (const k of Object.keys(next)) {
    const before = k === 'minStock' ? Number(item[k] || 0) : String(item[k] || '');
    if (before !== next[k]) changes.push(`${LABELS[k]}: ${before === '' ? '(empty)' : before} → ${next[k] === '' ? '(empty)' : next[k]}`);
  }
  if (!changes.length) return Promise.resolve({ queued: false, unchanged: true });
  const hRef = doc(collection(db, 'history'));
  const iRef = doc(db, 'items', item.id);
  const b = writeBatch(db);
  b.update(iRef, { ...next, updatedAt: serverTimestamp(), updatedBy: profile.uid, lastHistoryId: hRef.id });
  b.set(hRef, historyDoc(profile, { ...item, name: next.name, partNo: next.partNo, unit: next.unit }, {
    type: 'EDIT', delta: 0, stockAfter: item.qty, details: changes.join('; '),
  }));
  return commit(b, `Edit of ${item.name}`);
}

export function deleteItem(profile, item) {
  const hRef = doc(collection(db, 'history'));
  const b = writeBatch(db);
  b.delete(doc(db, 'items', item.id));
  b.set(hRef, historyDoc(profile, item, {
    type: 'DELETE', delta: -round3(item.qty), stockAfter: 0, details: `Item deleted (had ${item.qty} ${item.unit})`,
  }));
  return commit(b, `Deleting ${item.name}`);
}

// ------------------------------------------------------------------- prices

export function savePrice(profile, f, existing) {
  const base = {
    supplier: clean(f.supplier), item: clean(f.item), partNo: clean(f.partNo),
    price: Math.round(Number(f.price) * 100) / 100, unit: f.unit, note: clean(f.note),
    updatedAt: serverTimestamp(), updatedBy: profile.uid,
  };
  const b = writeBatch(db);
  if (existing) {
    const changed = Number(existing.price) !== base.price;
    const data = { ...base };
    if (changed) data.prevPrice = Number(existing.price);
    b.update(doc(db, 'prices', existing.id), data);
  } else {
    b.set(doc(collection(db, 'prices')), { ...base, createdAt: serverTimestamp() });
  }
  return commit(b, `Price for ${base.item}`);
}

export function deletePrice(id) {
  const b = writeBatch(db);
  b.delete(doc(db, 'prices', id));
  return commit(b, 'Deleting a price');
}

// ------------------------------------------------------------------- people

export function addInvite(profile, email, name) {
  const e = email.trim().toLowerCase();
  const b = writeBatch(db);
  b.set(doc(db, 'invites', e), { email: e, name: clean(name), invitedBy: profile.email, invitedAt: serverTimestamp() });
  return commit(b, 'Invite');
}
export function removeInvite(email) {
  const b = writeBatch(db);
  b.delete(doc(db, 'invites', email));
  return commit(b, 'Removing staff');
}

export async function upsertProfile(user, role) {
  try {
    await setDoc(doc(db, 'users', user.uid), {
      email: user.email.toLowerCase(),
      name: (user.displayName || user.email.split('@')[0]).slice(0, 100),
      photo: (user.photoURL || '').slice(0, 500),
      role,
      lastLogin: serverTimestamp(),
    });
  } catch (e) { console.warn('profile not saved', e); }
}

export async function readOwnerProbe() { return getDoc(doc(db, 'admin', 'probe')); }

// ------------------------------------------------------------------- import

const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };

export async function commitStockImport(profile, plan, fileName, onProgress = () => {}) {
  const fresh = plan.rows.filter((r) => r.status === 'new' && r.data);
  let done = 0;
  // supplier names first
  for (const part of chunk(plan.newSuppliers || [], 200)) {
    const b = writeBatch(db);
    for (const s of part) b.set(doc(db, 'suppliers', s.key), { name: s.name, reference: '', createdAt: serverTimestamp() });
    await b.commit();
  }
  for (const part of chunk(fresh, 150)) {
    const b = writeBatch(db);
    for (const row of part) {
      const r = row.data;
      const iRef = doc(collection(db, 'items'));
      const hRef = doc(collection(db, 'history'));
      const item = {
        name: r.name, partNo: r.partNo, brand: r.brand, model: r.model,
        qty: r.qty, unit: r.unit, minStock: r.minStock,
        createdAt: serverTimestamp(), createdBy: profile.uid,
        updatedAt: serverTimestamp(), updatedBy: profile.uid,
        lastHistoryId: hRef.id,
      };
      if (Object.keys(r.holders).length) item.holders = r.holders;
      b.set(iRef, item);
      b.set(hRef, historyDoc(profile, { ...item, id: iRef.id }, {
        type: 'NEW', delta: r.qty, stockAfter: r.qty, note: `Imported from ${fileName}`.slice(0, 300), details: 'Imported',
      }));
    }
    await b.commit();
    done += part.length;
    onProgress(done, fresh.length);
  }
  return done;
}

export async function commitPriceImport(profile, plan, onProgress = () => {}) {
  const todo = plan.rows.filter((r) => (r.status === 'new' || r.status === 'update') && r.data);
  let done = 0;
  for (const part of chunk(todo, 400)) {
    const b = writeBatch(db);
    for (const row of part) {
      const r = row.data;
      const base = {
        supplier: r.supplier, item: r.item, partNo: r.partNo, price: r.price, unit: r.unit, note: r.note,
        updatedAt: serverTimestamp(), updatedBy: profile.uid,
      };
      if (row.status === 'update') b.update(doc(db, 'prices', r.id), { ...base, prevPrice: r.prevPrice });
      else b.set(doc(collection(db, 'prices')), { ...base, createdAt: serverTimestamp() });
    }
    await b.commit();
    done += part.length;
    onProgress(done, todo.length);
  }
  return done;
}

export async function commitSupplierImport(plan, onProgress = () => {}) {
  const todo = plan.rows.filter((r) => r.status === 'new' && r.data);
  let done = 0;
  for (const part of chunk(todo, 400)) {
    const b = writeBatch(db);
    for (const row of part) b.set(doc(db, 'suppliers', row.data.key), { name: row.data.name, reference: row.data.reference, createdAt: serverTimestamp() });
    await b.commit();
    done += part.length;
    onProgress(done, todo.length);
  }
  return done;
}

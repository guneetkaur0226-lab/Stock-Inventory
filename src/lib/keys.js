// Text normalisation helpers shared by search, import and duplicate checks.

export const UNITS = ['pcs', 'set', 'kg', 'm', 'box'];
export const INT_UNITS = ['pcs', 'set', 'box'];

/** Trim and collapse repeated spaces: "Silencer  Shaktiman " -> "Silencer Shaktiman" */
export const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** Lower-case, letters+digits only. "RB-66 3(1/4)" -> "rb66314" */
export const squash = (s) => clean(s).toLowerCase().replace(/[^a-z0-9]/g, '');

function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

/** Safe key for a supplier name (used as a field name inside item.holders). */
export function slug(name) {
  const c = clean(name).toLowerCase();
  const s = c.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
  return s || 'h' + hash(c); // names in Hindi etc. fall back to a hash
}

/** Keys used to detect duplicate items. */
export function itemKeys(it) {
  const pk = clean(it.partNo) ? 'p:' + squash(it.partNo) : null;
  const nk = 'n:' + squash(it.name) + '|' + squash(it.brand) + '|' + squash(it.model);
  return { pk, nk };
}

export function buildItemIndex(items) {
  const pk = new Map();
  const nk = new Map();
  for (const it of items) {
    const k = itemKeys(it);
    if (k.pk && !pk.has(k.pk)) pk.set(k.pk, it);
    if (!nk.has(k.nk)) nk.set(k.nk, it);
  }
  return { pk, nk };
}

/** Existing item that this (new) item would duplicate, if any. */
export function findDuplicate(index, row) {
  const k = itemKeys(row);
  return k.pk ? index.pk.get(k.pk) : index.nk.get(k.nk);
}

export function priceKey(p) {
  return squash(p.supplier) + '|' + (clean(p.partNo) ? 'p:' + squash(p.partNo) : 'n:' + squash(p.item));
}

export const round3 = (n) => Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;

/** Total of per-supplier quantities (named holders only). */
export function holderTotal(it) {
  let t = 0;
  for (const h of Object.values(it.holders || {})) t += Number(h?.qty) || 0;
  return round3(t);
}

/** Sorted list of {key,name,qty} plus the unassigned remainder. */
export function holderList(it) {
  const out = Object.entries(it.holders || {})
    .map(([key, h]) => ({ key, name: h?.name || key, qty: round3(Number(h?.qty) || 0) }))
    .sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));
  const rest = round3((Number(it.qty) || 0) - holderTotal(it));
  return { named: out, unassigned: rest > 0 ? rest : 0 };
}

/** 'out' (nothing left), 'low' (at or below the alert level) or 'ok'. */
export const stockState = (it) => {
  if (it.qty <= 0) return 'out';
  if (it.minStock > 0 && it.qty <= it.minStock) return 'low';
  return 'ok';
};

export const UNITS = ['pcs', 'set', 'kg', 'm', 'box'];
export const INTEGER_UNITS = ['pcs', 'set', 'box'];

const UNIT_SYNONYMS = {
  pcs: ['pcs', 'pc', 'piece', 'pieces', 'nos', 'no', 'number', 'numbers', 'unit', 'units', 'each', 'ea'],
  set: ['set', 'sets'],
  kg: ['kg', 'kgs', 'kilo', 'kilos', 'kilogram', 'kilograms'],
  m: ['m', 'mtr', 'mtrs', 'meter', 'meters', 'metre', 'metres'],
  box: ['box', 'boxes', 'carton', 'cartons'],
};

/** Returns a valid unit or null if not recognised. */
export function normalizeUnit(v) {
  const s = String(v ?? '').toLowerCase().replace(/[^a-z]/g, '');
  if (!s) return null;
  for (const [unit, list] of Object.entries(UNIT_SYNONYMS)) if (list.includes(s)) return unit;
  return null;
}

/** Collapse whitespace, strip a leading CSV-safety apostrophe. */
export function clean(v, max = 1000) {
  if (v === null || v === undefined) return '';
  let s = String(v).replace(/\s+/g, ' ').trim();
  if (/^'[=+@-]/.test(s)) s = s.slice(1);
  return s.slice(0, max);
}

/** Lowercase, letters+digits only (unicode aware): "RB-66 3(1/4)" -> "rb66314" */
export const squish = (s) => String(s ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/** Lowercase with single spaces, punctuation turned into spaces. */
export const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/** Firestore-safe id from text. */
export function slug(s) {
  const t = String(s ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
  return t || 'x';
}

export const priceId = (supplier, item, partNo) => `${slug(supplier)}__${slug(partNo || item)}`;

export const round3 = (n) => Math.round((n + Number.EPSILON) * 1000) / 1000;

/** Parse "1,250", "₹ 1,250.50", "Rs. 40" -> number; '' / null -> null; junk -> NaN */
export function parseNumber(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v;
  const s = String(v).replace(/[₹,\s]|rs\.?|inr/gi, '');
  if (s === '') return null;
  return /^-?\d*\.?\d+$/.test(s) ? Number(s) : NaN;
}

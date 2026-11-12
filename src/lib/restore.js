// Reading the parts of a backup file that are not plain stock rows (suppliers and locations).
import { LOCATION_VALUES, locationText } from './locations.js';
import { clean, parseNumber, round3 } from './text.js';

export const MAX_LOCATION_ROWS = 3000;

const norm = (v) => String(v ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
export const sameName = (a, b) => norm(a) === norm(b);

/** The sheet whose name matches, preferring one that has data rows. */
export function findSheet(sheets, re) {
  return sheets.find((s) => re.test(s.name) && s.rows.length > 1) || sheets.find((s) => re.test(s.name)) || null;
}

function headerMap(row, wanted) {
  const map = {};
  (row || []).forEach((h, i) => {
    const k = norm(h);
    for (const [field, names] of Object.entries(wanted)) if (map[field] === undefined && names.includes(k)) map[field] = i;
  });
  return map;
}

/** Suppliers sheet: Supplier, Address, Description -> [{ name, address, note }] */
export function parseSuppliersSheet(rows) {
  if (!rows?.length) return [];
  const cols = headerMap(rows[0], {
    name: ['supplier', 'supplier name', 'name'],
    address: ['address'],
    note: ['description', 'reference', 'note', 'notes'],
  });
  if (cols.name === undefined) return [];
  const out = [];
  const seen = new Set();
  for (const r of rows.slice(1)) {
    const name = clean(r[cols.name], 200);
    if (!name || name.length > 80 || seen.has(norm(name))) continue;
    seen.add(norm(name));
    out.push({
      name,
      address: cols.address === undefined ? '' : clean(r[cols.address], 300),
      note: cols.note === undefined ? '' : clean(r[cols.note], 500),
    });
  }
  return out;
}

const locationByText = new Map();
for (const v of LOCATION_VALUES) {
  locationByText.set(norm(v), v);
  locationByText.set(norm(locationText(v)), v);
}

/** Locations sheet: Supplier, Item, Part No, Location, Quantity -> { rows, invalid } */
export function parseLocationsSheet(rows) {
  const out = { rows: [], invalid: 0, tooMany: false };
  if (!rows?.length) return out;
  const cols = headerMap(rows[0], {
    supplier: ['supplier'],
    item: ['item', 'item name', 'name'],
    partNo: ['part no', 'part no.', 'part number'],
    location: ['location'],
    qty: ['quantity', 'qty'],
  });
  if ([cols.supplier, cols.item, cols.location, cols.qty].some((c) => c === undefined)) return out;
  const data = rows.slice(1).filter((r) => r.some((c) => c !== null && String(c).trim() !== ''));
  if (data.length > MAX_LOCATION_ROWS) out.tooMany = true;
  for (const r of data.slice(0, MAX_LOCATION_ROWS)) {
    const supplier = clean(r[cols.supplier], 200);
    const item = clean(r[cols.item], 200);
    const location = locationByText.get(norm(r[cols.location]));
    const qty = parseNumber(r[cols.qty]);
    if (!supplier || !item || !location || qty === null || Number.isNaN(qty) || qty <= 0) {
      out.invalid += 1;
      continue;
    }
    out.rows.push({ supplier, item, partNo: cols.partNo === undefined ? '' : clean(r[cols.partNo], 100), location, qty: round3(qty) });
  }
  return out;
}

/** Finds the item a backup row refers to (part no. first, then name). */
export function findItem(items, name, partNo) {
  const p = norm(partNo);
  const n = norm(name);
  return (
    (p && items.find((i) => norm(i.partNo) === p && norm(i.name) === n)) ||
    (p && items.find((i) => norm(i.partNo) === p)) ||
    items.find((i) => norm(i.name) === n && !norm(i.partNo)) ||
    items.find((i) => norm(i.name) === n) ||
    null
  );
}

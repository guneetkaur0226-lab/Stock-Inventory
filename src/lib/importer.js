// Import parsing + planning. Pure functions (no Firebase) so they can be tested.
import { clean, normalizeUnit, parseNumber, squish, priceId, slug, INTEGER_UNITS, round3 } from './text.js';

export const MAX_ROWS = 500;

// ------------------------------------------------------------------ headings
const key = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');

const STOCK_HEADS = {
  name: ['name', 'itemname', 'item', 'items', 'product', 'products', 'productname', 'description', 'particulars', 'partname', 'itemdescription', 'article'],
  partNo: ['partno', 'partnumber', 'part', 'partcode', 'pn', 'pno', 'code', 'itemcode', 'sku', 'partno', 'modelno'],
  brand: ['brand', 'make', 'company', 'manufacturer', 'mfr', 'mfg'],
  model: ['model', 'compatiblemodel', 'compatible', 'compatiblewith', 'fits', 'application', 'suitablefor', 'usedin', 'generatormodel', 'motormodel', 'equipment', 'machine'],
  qty: ['qty', 'quantity', 'stock', 'pcs', 'pieces', 'balance', 'instock', 'closingstock', 'available', 'currentstock', 'totalstock', 'total'],
  unit: ['unit', 'uom', 'units'],
  minQty: ['minstock', 'min', 'minimum', 'minimumstock', 'minqty', 'minquantity', 'reorder', 'reorderlevel', 'alert', 'alertlevel', 'lowstock', 'minlevel'],
  unassigned: ['unassigned', 'otherunassigned', 'other', 'others', 'nosupplier', 'unknownsupplier'],
};
const IGNORED_HEADS = ['sno', 'srno', 'sr', 'slno', 'serial', 'serialno', 'no', '#', 'remarks', 'remark', 'note', 'notes', 'comments', 'comment', 'reference', 'date', 'updated', 'lastupdated'];

const PRICE_HEADS = {
  supplier: ['supplier', 'suppliername', 'manufacturer', 'vendor', 'vendorname', 'party', 'partyname', 'seller', 'from', 'dealer'],
  item: ['item', 'itemname', 'name', 'product', 'products', 'description', 'particulars', 'partname'],
  partNo: STOCK_HEADS.partNo,
  price: ['price', 'rate', 'cost', 'amount', 'rs', 'inr', 'priceinr', 'unitprice', 'purchaseprice', 'buyprice', 'mrp'],
  unit: ['unit', 'uom', 'per'],
  note: ['note', 'notes', 'remarks', 'remark', 'comment', 'comments'],
};

const SUPPLIER_HEADS = {
  name: ['supplier', 'suppliername', 'name', 'vendor', 'party', 'partyname', 'manufacturer'],
  note: ['reference', 'ref', 'note', 'notes', 'remarks', 'remark', 'details', 'supplies', 'deals'],
};

function matchHead(heads, cell) {
  const k = key(cell);
  if (!k) return null;
  for (const [field, list] of Object.entries(heads)) if (list.includes(k)) return field;
  return null;
}

function findHeaderRow(rows, heads, requiredFields) {
  const limit = Math.min(rows.length, 20);
  let best = -1;
  let bestScore = 0;
  for (let i = 0; i < limit; i++) {
    const found = new Set();
    for (const c of rows[i] || []) {
      const f = matchHead(heads, c);
      if (f) found.add(f);
    }
    if (!requiredFields.every((f) => found.has(f))) continue;
    if (found.size > bestScore) {
      best = i;
      bestScore = found.size;
    }
  }
  return best;
}

const isEmptyRow = (r) => !r || r.every((c) => c === null || c === undefined || String(c).trim() === '');

function mapColumns(headerRow, heads) {
  const cols = {};
  const unknown = [];
  headerRow.forEach((c, idx) => {
    const f = matchHead(heads, c);
    if (f && cols[f] === undefined) cols[f] = idx;
    else if (clean(c) && !f) unknown.push({ idx, name: clean(c, 80) });
  });
  return { cols, unknown };
}

// -------------------------------------------------------------------- STOCK
/**
 * Finds the heading row and columns. Any extra numeric column (that is not a
 * known heading such as Remarks) is offered as a SUPPLIER column - this is how
 * the shop's own "products x suppliers" sheet is read.
 */
export function analyzeStock(rows) {
  const hi = findHeaderRow(rows, STOCK_HEADS, ['name']);
  if (hi < 0) {
    return { error: 'Could not find a heading row with an Item / Name / Products column.' };
  }
  const { cols, unknown } = mapColumns(rows[hi], STOCK_HEADS);
  const data = rows.slice(hi + 1).filter((r) => !isEmptyRow(r));
  const supplierCols = [];
  for (const u of unknown) {
    if (IGNORED_HEADS.includes(key(u.name))) continue;
    const vals = data.map((r) => r[u.idx]).filter((v) => v !== null && v !== undefined && String(v).trim() !== '');
    const numeric = vals.filter((v) => !Number.isNaN(parseNumber(v))).length;
    supplierCols.push({ idx: u.idx, name: u.name, count: vals.length, enabled: vals.length > 0 && numeric === vals.length });
  }
  return { headerIdx: hi, cols, supplierCols, data, headerRow: rows[hi] };
}

const existingKeys = (items) => {
  const parts = new Set();
  const names = new Set();
  const namePart = new Set();
  for (const it of items) {
    const p = squish(it.partNo);
    const n = squish(it.name);
    if (p) parts.add(p);
    names.add(n);
    namePart.add(n + '|' + p);
  }
  return { parts, names, namePart };
};

/** -> { newRows, skipped, invalid, tooMany } */
export function planStock(analysis, enabledIdx, existingItems) {
  const { cols, supplierCols, data } = analysis;
  const useSup = supplierCols.filter((c) => enabledIdx.includes(c.idx));
  const out = { newRows: [], skipped: [], invalid: [], tooMany: data.length > MAX_ROWS, total: data.length };
  const ex = existingKeys(existingItems);
  const seenParts = new Set();
  const seenNames = new Set();
  const seenNamePart = new Set();

  data.forEach((r, i) => {
    const rowNo = analysis.headerIdx + 2 + i; // 1-based sheet row
    const get = (f) => (cols[f] === undefined ? null : r[cols[f]]);
    const name = clean(get('name'), 200);
    const partNo = clean(get('partNo'), 100);
    const brand = clean(get('brand'), 100);
    const model = clean(get('model'), 200);
    const errs = [];
    if (!name) errs.push('Name is missing');
    if (name.length > 120) errs.push('Name is longer than 120 characters');
    if (partNo.length > 60) errs.push('Part no. is longer than 60 characters');
    if (brand.length > 60) errs.push('Brand is longer than 60 characters');
    if (model.length > 120) errs.push('Model is longer than 120 characters');

    let unit = 'pcs';
    const unitRaw = get('unit');
    if (clean(unitRaw)) {
      unit = normalizeUnit(unitRaw);
      if (!unit) errs.push(`Unit "${clean(unitRaw)}" is not one of pcs, set, kg, m, box`);
    }

    let minQty = 0;
    const minRaw = parseNumber(get('minQty'));
    if (Number.isNaN(minRaw) || (minRaw !== null && minRaw < 0)) errs.push('Minimum stock must be a number, 0 or more');
    else if (minRaw !== null) minQty = minRaw;

    // quantity
    const bySupplier = {};
    let supTotal = 0;
    for (const c of useSup) {
      const v = parseNumber(r[c.idx]);
      if (Number.isNaN(v) || (v !== null && v < 0)) {
        errs.push(`"${r[c.idx]}" under ${c.name} is not a valid quantity`);
      } else if (v) {
        bySupplier[c.name] = round3(v);
        supTotal += v;
      }
    }
    let qty = 0;
    const qtyRaw = parseNumber(get('qty'));
    const unRaw = parseNumber(get('unassigned'));
    if (Number.isNaN(qtyRaw) || (qtyRaw !== null && qtyRaw < 0)) errs.push('Quantity must be a number, 0 or more');
    if (Number.isNaN(unRaw) || (unRaw !== null && unRaw < 0)) errs.push('Unassigned quantity must be a number, 0 or more');
    if (!errs.length) {
      if (useSup.length) {
        const extra = unRaw !== null ? unRaw : qtyRaw !== null ? Math.max(0, qtyRaw - supTotal) : 0;
        qty = round3(supTotal + extra);
      } else {
        qty = round3((qtyRaw ?? 0) + (unRaw ?? 0));
      }
      if (INTEGER_UNITS.includes(unit) && !Number.isInteger(qty)) errs.push(`Quantity ${qty} must be a whole number for unit "${unit}"`);
      if (qty > 10000000) errs.push('Quantity is too large');
    }

    if (errs.length) {
      out.invalid.push({ rowNo, name: name || '(blank)', reason: errs.join('; ') });
      return;
    }

    const pk = squish(partNo);
    const nk = squish(name);
    const dupExisting = pk ? ex.parts.has(pk) || ex.namePart.has(nk + '|' + pk) : ex.names.has(nk);
    if (dupExisting) {
      out.skipped.push({ rowNo, name, reason: 'Already in stock list' });
      return;
    }
    const dupFile = pk ? seenParts.has(pk) || seenNamePart.has(nk + '|' + pk) : seenNames.has(nk);
    if (dupFile) {
      out.skipped.push({ rowNo, name, reason: 'Repeated in this file' });
      return;
    }
    if (pk) seenParts.add(pk);
    seenNames.add(nk);
    seenNamePart.add(nk + '|' + pk);
    out.newRows.push({ rowNo, name, partNo, brand, model, unit, minQty, qty, bySupplier });
  });
  return out;
}

// ----------------------------------------------------------- SUPPLIER PRICES
export function analyzePrices(rows) {
  const hi = findHeaderRow(rows, PRICE_HEADS, ['supplier', 'price']);
  if (hi < 0) return { error: 'Could not find a heading row with Supplier and Price (or Rate) columns.' };
  const { cols } = mapColumns(rows[hi], PRICE_HEADS);
  if (cols.item === undefined && cols.partNo === undefined) {
    return { error: 'Need an Item (or Part No.) column as well.' };
  }
  const data = rows.slice(hi + 1).filter((r) => !isEmptyRow(r));
  return { headerIdx: hi, cols, data };
}

/** existing: Map id -> price doc. -> { newRows, updatedRows, unchanged, invalid } */
export function planPrices(analysis, existing) {
  const { cols, data } = analysis;
  const out = { newRows: [], updatedRows: [], skipped: [], invalid: [], tooMany: data.length > MAX_ROWS, total: data.length };
  const seen = new Set();
  data.forEach((r, i) => {
    const rowNo = analysis.headerIdx + 2 + i;
    const get = (f) => (cols[f] === undefined ? null : r[cols[f]]);
    const supplier = clean(get('supplier'), 200);
    const item = clean(get('item'), 200) || clean(get('partNo'), 200);
    const partNo = clean(get('partNo'), 100);
    const note = clean(get('note'), 300);
    const priceRaw = parseNumber(get('price'));
    const errs = [];
    if (!supplier) errs.push('Supplier is missing');
    else if (supplier.length > 80) errs.push('Supplier name is longer than 80 characters');
    if (!item) errs.push('Item is missing');
    else if (item.length > 120) errs.push('Item name is longer than 120 characters');
    if (partNo.length > 60) errs.push('Part no. is longer than 60 characters');
    if (note.length > 200) errs.push('Note is longer than 200 characters');
    if (priceRaw === null || Number.isNaN(priceRaw) || priceRaw <= 0) errs.push('Price must be a number greater than 0');
    else if (priceRaw >= 100000000) errs.push('Price is too large');
    let unit = 'pcs';
    if (clean(get('unit'))) {
      unit = normalizeUnit(get('unit'));
      if (!unit) errs.push(`Unit "${clean(get('unit'))}" is not one of pcs, set, kg, m, box`);
    }
    if (errs.length) return out.invalid.push({ rowNo, name: `${supplier || '?'} / ${item || '?'}`, reason: errs.join('; ') });

    const id = priceId(supplier, item, partNo);
    if (seen.has(id)) return out.skipped.push({ rowNo, name: `${supplier} / ${item}`, reason: 'Repeated in this file' });
    seen.add(id);
    const price = Math.round(priceRaw * 100) / 100;
    const row = { rowNo, id, supplier, item, partNo, price, unit, note };
    const old = existing.get(id);
    if (!old) out.newRows.push(row);
    else if (old.price === price) out.skipped.push({ rowNo, name: `${supplier} / ${item}`, reason: `Price unchanged (₹${price})` });
    else out.updatedRows.push({ ...row, prevPrice: old.price });
  });
  return out;
}

// ------------------------------------------------------------ SUPPLIER NAMES
export function analyzeSuppliers(rows) {
  const hi = findHeaderRow(rows, SUPPLIER_HEADS, ['name']);
  if (hi < 0) return { error: 'Could not find a heading row with a Supplier column.' };
  const { cols } = mapColumns(rows[hi], SUPPLIER_HEADS);
  return { headerIdx: hi, cols, data: rows.slice(hi + 1).filter((r) => !isEmptyRow(r)) };
}

export function planSuppliers(analysis, existingIds) {
  const { cols, data } = analysis;
  const out = { newRows: [], skipped: [], invalid: [], tooMany: data.length > MAX_ROWS, total: data.length };
  const seen = new Set();
  data.forEach((r, i) => {
    const rowNo = analysis.headerIdx + 2 + i;
    const name = clean(r[cols.name], 200);
    const note = clean(cols.note === undefined ? '' : r[cols.note], 300);
    if (!name) return out.invalid.push({ rowNo, name: '(blank)', reason: 'Supplier name is missing' });
    if (name.length > 80) return out.invalid.push({ rowNo, name, reason: 'Name is longer than 80 characters' });
    if (note.length > 200) return out.invalid.push({ rowNo, name, reason: 'Note is longer than 200 characters' });
    const id = slug(name);
    if (existingIds.has(id)) return out.skipped.push({ rowNo, name, reason: 'Supplier already exists' });
    if (seen.has(id)) return out.skipped.push({ rowNo, name, reason: 'Repeated in this file' });
    seen.add(id);
    out.newRows.push({ rowNo, id, name, note });
  });
  return out;
}

// --------------------------------------------------------------- FILE READER
/** Reads .xlsx/.xls/.csv -> [{name, rows}] */
export async function readSpreadsheet(file) {
  const XLSX = await import('xlsx');
  const isCsv = /\.csv$/i.test(file.name) || file.type === 'text/csv';
  const wb = isCsv
    ? XLSX.read(await file.text(), { type: 'string' })
    : XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
  return wb.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: false }),
  }));
}

/** Guess the best sheet for an import type. */
export function guessSheet(sheets, kind) {
  const want = {
    stock: /stock|item|product|inventory/i,
    prices: /price|rate/i,
    suppliers: /^supplier/i,
  }[kind];
  return sheets.findIndex((s) => want.test(s.name) && s.rows.length > 1) >= 0
    ? sheets.findIndex((s) => want.test(s.name) && s.rows.length > 1)
    : 0;
}

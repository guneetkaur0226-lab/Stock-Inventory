// Builds rows whose headings match what the importer reads.
import { fmtDateFull, fmtTime } from './format.js';
import { buckets } from '../db.js';
import { locationText } from './locations.js';

export const STOCK_HEAD = ['Name', 'Part No', 'Brand', 'Model', 'Qty', 'Unit', 'Min Stock'];
export const PRICE_HEAD = ['Supplier', 'Item', 'Part No', 'Price', 'Unit', 'Note', 'Last Updated', 'Previous Price'];
export const HISTORY_HEAD = ['Date', 'Time', 'Type', 'Item', 'Part No', 'Qty', 'Unit', 'Stock After', 'Supplier', 'Note', 'By', 'Location'];

export function stockRows(items) {
  const sup = new Set();
  items.forEach((i) => Object.keys(i.bySupplier || {}).forEach((s) => sup.add(s)));
  const names = [...sup].sort((a, b) => a.localeCompare(b));
  const head = [...STOCK_HEAD, ...(names.length ? [...names, 'Unassigned'] : [])];
  const body = items.map((i) => {
    const { by, unassigned } = buckets(i);
    return [
      i.name, i.partNo, i.brand, i.model, i.qty, i.unit, i.minQty,
      ...(names.length ? [...names.map((n) => by[n] || 0), unassigned] : []),
    ];
  });
  return [head, ...body];
}

export function priceRows(prices) {
  const sorted = [...prices].sort((a, b) => a.supplier.localeCompare(b.supplier) || a.item.localeCompare(b.item));
  return [
    PRICE_HEAD,
    ...sorted.map((p) => [p.supplier, p.item, p.partNo, p.price, p.unit, p.note, fmtDateFull(p.updatedAt?.toDate?.()), p.prevPrice ?? '']),
  ];
}

export function historyRows(moves) {
  return [
    HISTORY_HEAD,
    ...moves.map((m) => {
      const d = m.at?.toDate?.();
      return [fmtDateFull(d), fmtTime(d), m.type, m.itemName, m.partNo, m.qty, m.unit, m.stockAfter, m.supplier, m.note, m.byName, m.type === 'MOVE' ? `${locationText(m.location) || 'No location set'} → ${locationText(m.toLocation)}` : locationText(m.location)];
    }),
  ];
}

export const TEMPLATE_SHEETS = [
  { name: 'Stock', rows: [STOCK_HEAD] },
  { name: 'Stock by supplier', rows: [['Products', 'Supplier 1', 'Supplier 2', 'Supplier 3']] },
  { name: 'Supplier Prices', rows: [['Supplier', 'Item', 'Part No', 'Price', 'Unit', 'Note']] },
  { name: 'Suppliers', rows: [['Supplier', 'Reference']] },
  {
    name: 'Read me',
    rows: [
      ['How to use this template'],
      ['1. Fill ONE sheet, then import it in the app: More → Import.'],
      ['2. "Stock": one row per item. Unit must be pcs, set, kg, m or box. Max 500 rows per import.'],
      ['3. "Stock by supplier": first column = item name; every other column = one supplier, with the quantity you hold from them. Rename Supplier 1/2/3 to real names, add or remove columns.'],
      ['4. "Supplier Prices": Supplier, Item, Part No (optional), Price in rupees. Existing prices are updated only if the price changed.'],
      ['5. "Suppliers": supplier names with a note about what they supply.'],
      ['Headings are matched flexibly: Qty/Quantity, Rate/Price, Item/Products, etc.'],
      ['Stock import never overwrites items already in the app - it only adds new ones.'],
    ],
  },
];

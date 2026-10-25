// Supplier -> Item -> Location -> Quantity.
//
// Location is NOT stored on the item. Each (supplier, item, location) quantity is its own small
// document in the `locStock` collection. The item keeps its total `qty` and `bySupplier` exactly as
// before, so all older data keeps working. Stock that has a supplier but no location yet is simply
// "No location set" = bySupplier[supplier] minus the located rows.
import { LOCATION_VALUES, locationText } from './locations.js';
import { slug, round3 } from './text.js';

/** Document id of one supplier + item + location quantity. */
export const locDocId = (supplier, itemId, location) => `${slug(supplier)}__${itemId}__${slug(location)}`;

const locOrder = (v) => {
  const i = LOCATION_VALUES.indexOf(v);
  return i < 0 ? 999 : i;
};

/** locStock rows grouped by item id. */
export function groupByItem(rows) {
  const m = new Map();
  for (const r of rows || []) {
    if (!m.has(r.itemId)) m.set(r.itemId, []);
    m.get(r.itemId).push(r);
  }
  return m;
}

/** Rows of ONE supplier for ONE item (names matched ignoring case / punctuation). */
export const rowsForSupplier = (itemRows, supplier) => (itemRows || []).filter((r) => slug(r.supplier) === slug(supplier));

export const sumQty = (rows) => round3((rows || []).reduce((a, r) => a + (Number(r.qty) || 0), 0));

/** The supplier's key inside item.bySupplier (or the name itself when it has no entry yet). */
export const supplierKey = (item, supplier) => Object.keys(item.bySupplier || {}).find((k) => slug(k) === slug(supplier)) || supplier;

/** Stock held for this supplier that has no location yet. */
export function unlocated(item, itemRows, supplier) {
  const have = Number((item.bySupplier || {})[supplierKey(item, supplier)]) || 0;
  return Math.max(0, round3(have - sumQty(rowsForSupplier(itemRows, supplier))));
}

/**
 * Everything the Suppliers tab shows for one supplier + item:
 *   lines: [{ id, location, qty, rowId }]  (one per location, plus "No location set" when there is such stock)
 *   supplierStock: quantity that belongs to THIS supplier (all its locations)
 *   totalStock: the item's total across all suppliers and locations
 */
export function supplierItemView(item, itemRows, supplier) {
  const mine = rowsForSupplier(itemRows, supplier).sort((a, b) => locOrder(a.location) - locOrder(b.location));
  const lines = mine.map((r) => ({ id: r.id, rowId: r.id, location: r.location, qty: Number(r.qty) || 0 }));
  const rest = unlocated(item, itemRows, supplier);
  if (rest > 0) lines.push({ id: 'none', rowId: null, location: '', qty: rest });
  return {
    key: supplierKey(item, supplier),
    lines,
    supplierStock: round3(sumQty(mine) + rest),
    totalStock: Number(item.qty) || 0,
  };
}

/** Does this supplier have anything to do with this item? (stock, or a chosen location slot) */
export const isAssociated = (item, itemRows, supplier) =>
  Object.keys(item.bySupplier || {}).some((k) => slug(k) === slug(supplier)) || rowsForSupplier(itemRows, supplier).length > 0;

export const placeText = (loc) => locationText(loc) || 'No location set';

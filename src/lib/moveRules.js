// Checks and planning for stock IN / OUT / MOVE that involve locations (pure functions, no Firebase).
import { LOCATION_VALUES, locationText } from './locations.js';
import { INTEGER_UNITS, round3, slug } from './text.js';
import { rowsForSupplier, sumQty, supplierKey, unlocated } from './stockLoc.js';

function qtyError(item, qty) {
  if (!Number.isFinite(qty) || qty <= 0) return 'Enter a quantity greater than 0.';
  if (INTEGER_UNITS.includes(item.unit) && !Number.isInteger(qty)) return `Quantity must be a whole number for ${item.unit}.`;
  if (Math.round(qty * 1000) / 1000 !== qty) return 'Use at most 3 decimal places.';
  if (qty > 1000000) return 'That quantity is too large.';
  return '';
}

const rowAt = (itemRows, supplier, location) => rowsForSupplier(itemRows, supplier).find((r) => r.location === location);

/**
 * "Any / not sure" OUT: takes stock that is not tied to a location (unassigned first, then each
 * supplier's stock that has no location). Returns { supplierKey: newBySupplierQty } or null when
 * that is not enough (then the person must choose a supplier and location).
 */
export function planOutAny(item, itemRows, qty) {
  const by = item.bySupplier || {};
  const sum = Object.values(by).reduce((a, b) => a + (Number(b) || 0), 0);
  let left = round3(qty - Math.min(qty, Math.max(0, round3((Number(item.qty) || 0) - sum))));
  const changes = {};
  const order = Object.keys(by)
    .map((k) => ({ k, cap: unlocated(item, itemRows, k) }))
    .filter((x) => x.cap > 0)
    .sort((a, b) => b.cap - a.cap);
  for (const { k, cap } of order) {
    if (left <= 0) break;
    const take = Math.min(cap, left);
    changes[k] = round3((Number(by[k]) || 0) - take);
    left = round3(left - take);
  }
  return left > 0 ? null : changes;
}

/** Returns an error message, or '' when the movement is fine. */
export function validateLocMove(item, itemRows, { type, qty, supplier = '', location = '', toLocation = '' }) {
  const basic = qtyError(item, qty);
  if (basic) return basic;
  if (location && !LOCATION_VALUES.includes(location)) return 'Please choose a location from the list.';
  if (location && !supplier) return 'Choose a supplier to record a location.';

  if (type === 'IN') return '';

  if (type === 'OUT') {
    if (supplier && location) {
      const have = rowAt(itemRows, supplier, location)?.qty || 0;
      if (qty > have) return `Only ${have} ${item.unit} of ${supplier} at ${locationText(location)}. You cannot take out ${qty}.`;
      return '';
    }
    if (supplier) {
      const have = unlocated(item, itemRows, supplier);
      if (qty > have) {
        if (sumQty(rowsForSupplier(itemRows, supplier)) > 0) return `Only ${have} ${item.unit} of ${supplier} has no location set. Choose the location to take from.`;
        return `Only ${have} ${item.unit} recorded under ${supplier}. Choose "Any / not sure" or a smaller quantity.`;
      }
      return '';
    }
    if (!planOutAny(item, itemRows, qty)) return 'That much is spread over locations. Choose the supplier and location to take it from.';
    return '';
  }

  if (type === 'MOVE') {
    if (!supplier) return 'Choose a supplier.';
    if (!LOCATION_VALUES.includes(toLocation)) return 'Choose the location to move to.';
    if (toLocation === location) return 'Choose a different location to move to.';
    const have = location ? rowAt(itemRows, supplier, location)?.qty || 0 : unlocated(item, itemRows, supplier);
    if (qty > have) return `Only ${have} ${item.unit} available${location ? ` at ${locationText(location)}` : ' without a location'}.`;
    return '';
  }
  return 'Unknown stock change.';
}

export { slug, supplierKey };

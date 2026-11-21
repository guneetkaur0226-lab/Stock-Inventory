// Runs a restore: suppliers, items, supplier links of existing items, then location quantities.
// (Kept out of the screen so it can be tested.)
import { importStock, moveStock, relinkSuppliers, restoreSuppliers } from '../db.js';
import { findItem, planRelinks } from './restore.js';
import { rowsForSupplier } from './stockLoc.js';
import { slug } from './text.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function runRestore({ preview, supplierIds, getItems, getLocStock, user, onProgress = () => {}, pollMs = 500 }) {
  const result = { added: 0, newSuppliers: 0, relinked: 0, placed: 0, skipped: 0, already: 0, reasons: [] };
  const why = (m) => {
    if (!result.reasons.includes(m) && result.reasons.length < 4) result.reasons.push(m);
  };

  const newSup = preview.newSuppliers;
  if (newSup.length) await restoreSuppliers({ rows: newSup });
  result.newSuppliers = newSup.length;

  const rows = preview.stockPlan?.newRows || [];
  if (rows.length) {
    const known = new Set([...supplierIds, ...newSup.map((s) => slug(s.name))]);
    await importStock({ rows, user, existingSupplierIds: known, onProgress: (d, t) => onProgress(`Adding items… ${d} of ${t}`) });
    for (let i = 0; i < 30; i++) {
      if (rows.every((r) => findItem(getItems(), r.name, r.partNo))) break;
      await sleep(pollMs);
    }
  }
  result.added = rows.length;

  // items that still exist but lost their supplier (for example a deleted supplier): link them again
  const relinks = planRelinks(preview.analysis, preview.enabled, getItems());
  if (relinks.length) {
    await relinkSuppliers({ list: relinks, user, onProgress: (d, t) => onProgress(`Reconnecting suppliers to items… ${d} of ${t}`) });
    for (let i = 0; i < 30; i++) {
      const have = getItems();
      const ok = relinks.every(({ item, add }) => {
        const now = have.find((x) => x.id === item.id);
        return now && Object.keys(add).every((k) => Object.keys(now.bySupplier || {}).some((b) => slug(b) === slug(k)));
      });
      if (ok) break;
      await sleep(pollMs);
    }
  }
  result.relinked = relinks.length;

  const local = new Map(); // item id -> its location rows, kept up to date while restoring
  const locRows = preview.locations.rows;
  for (let i = 0; i < locRows.length; i++) {
    onProgress(`Placing stock at locations… ${i + 1} of ${locRows.length}`);
    const r = locRows[i];
    const item = findItem(getItems(), r.item, r.partNo);
    if (!item) {
      result.skipped++;
      why(`item "${r.item}" is not in the app`);
      continue;
    }
    if (!local.has(item.id)) local.set(item.id, getLocStock().filter((x) => x.itemId === item.id));
    const itemRows = local.get(item.id);
    if (rowsForSupplier(itemRows, r.supplier).some((x) => x.location === r.location)) {
      result.already++; // nothing to do, not a problem
      continue;
    }
    try {
      await moveStock({ item, supplier: r.supplier, from: '', to: r.location, qty: r.qty, itemRows, note: 'Restored from backup', user });
      itemRows.push({ id: `${slug(r.supplier)}__${item.id}__${slug(r.location)}`, itemId: item.id, supplier: r.supplier, location: r.location, qty: r.qty });
      result.placed++;
    } catch (e) {
      result.skipped++;
      why(`${r.supplier} / ${r.item}: ${e.message}`);
    }
  }
  return result;
}

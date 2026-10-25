// Pure helpers for the History screen filters (kept separate so they can be tested).
import { makeHaystack, matchesQuery } from './search.js';
import { locationText } from './locations.js';

const DAY = 86400000;

/** "2026-10-20" -> local midnight of that day, or null when it is not a real date. */
export function dayStart(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || '');
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Turns the date-filter choice into { from, to } (from inclusive, to exclusive, either may be null)
 * or { error }. The end date typed by the person is INCLUDED (to = start of the next day).
 */
export function resolveDateRange(kind, customFrom, customTo, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (kind === 'all') return { from: null, to: null };
  if (kind === 'today') return { from: today, to: null };
  if (kind === 'd7') return { from: new Date(today.getTime() - 6 * DAY), to: null };
  if (kind === 'd30') return { from: new Date(today.getTime() - 29 * DAY), to: null };
  // custom: either end may be left empty
  const f = customFrom ? dayStart(customFrom) : null;
  const t = customTo ? dayStart(customTo) : null;
  if ((customFrom && !f) || (customTo && !t)) return { error: 'Please choose valid dates.' };
  if (f && t && t < f) return { error: 'The end date must not be before the start date.' };
  return { from: f, to: t ? new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1) : null };
}

/** Client-side filters applied to the loaded history entries. */
export function applyHistoryFilters(moves, { type = 'ALL', q = '', staff = '', supplier = '', item = '', location = '' } = {}) {
  return moves.filter((m) => {
    if (type !== 'ALL' && m.type !== type) return false;
    if (staff && m.by !== staff) return false;
    if (item && m.itemId !== item) return false;
    if (supplier && String(m.supplier || '').toLowerCase() !== supplier.toLowerCase()) return false;
    if (location && m.location !== location && m.toLocation !== location) return false;
    if (!q.trim()) return true;
    return matchesQuery(makeHaystack(m.itemName, m.partNo, m.note, m.byName, m.supplier, m.type, locationText(m.location), locationText(m.toLocation)), q);
  });
}

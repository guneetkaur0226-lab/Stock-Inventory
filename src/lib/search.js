import { norm, squish } from './text.js';

/**
 * Multi-word search. Every word typed must appear somewhere in the item's
 * name, part no., brand or model (any order). "carbon brush kirloskar" works.
 * Part numbers also match without dashes/spaces: "rb66" finds "RB-66".
 */
export function makeHaystack(...fields) {
  const text = fields.filter(Boolean).join(' ');
  return { n: norm(text), s: squish(text) };
}

export function matchesQuery(hay, query) {
  const words = norm(query).split(' ').filter(Boolean);
  if (!words.length) return true;
  return words.every((w) => hay.n.includes(w) || hay.s.includes(squish(w)));
}

/** Filters + ranks items (name-starts-with first). */
export function searchItems(items, query) {
  const q = norm(query);
  if (!q) return items;
  const out = [];
  for (const it of items) {
    if (!it._hay) it._hay = makeHaystack(it.name, it.partNo, it.brand, it.model);
    if (matchesQuery(it._hay, query)) {
      const rank = norm(it.name).startsWith(q) ? 0 : squish(it.partNo) === squish(q) ? 0 : 1;
      out.push([rank, it]);
    }
  }
  out.sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name));
  return out.map((x) => x[1]);
}

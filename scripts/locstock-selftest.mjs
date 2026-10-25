// Run: node scripts/locstock-selftest.mjs   (no packages needed)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { LOCATION_VALUES } from '../src/lib/locations.js';
import { locDocId, supplierItemView, unlocated, isAssociated, groupByItem } from '../src/lib/stockLoc.js';
import { validateLocMove, planOutAny } from '../src/lib/moveRules.js';
import { applyHistoryFilters, resolveDateRange } from '../src/lib/historyFilter.js';

// 1) the location list in the app and in firestore.rules must be identical
const rules = fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
for (const v of LOCATION_VALUES) assert.ok(rules.includes(`'${v}'`), `firestore.rules is missing location: ${v}`);
assert.equal(LOCATION_VALUES.length, 8);

// 2) ids are unique per supplier + item + location
const ids = new Set(LOCATION_VALUES.map((l) => locDocId('Arjun', 'i1', l)));
assert.equal(ids.size, 8);
assert.notEqual(locDocId('Arjun', 'i1', 'Mayapuri Shop > W-82/3'), locDocId('Arjun', 'i1', 'Mayapuri Shop > W-82/3 Upper Ground'));
assert.notEqual(locDocId('Arjun', 'i1', LOCATION_VALUES[0]), locDocId('Arjun', 'i2', LOCATION_VALUES[0]));

// 3) existing data (supplier qty, no location) shows as "No location set"
const item = { id: 'i1', name: 'Silencer', qty: 50, unit: 'pcs', bySupplier: { Arjun: 30, Bobby: 10 } };
let v = supplierItemView(item, [], 'Arjun');
assert.deepEqual(v.lines.map((l) => [l.location, l.qty]), [['', 30]]);
assert.equal(v.supplierStock, 30);
assert.equal(v.totalStock, 50);

// 4) same supplier + item at several locations: separate lines, remainder kept
const rows = [
  { id: 'a', itemId: 'i1', supplier: 'Arjun', location: 'Mayapuri Shop > W-82/2', qty: 12 },
  { id: 'b', itemId: 'i1', supplier: 'Arjun', location: 'Godown > Ground Floor', qty: 8 },
  { id: 'c', itemId: 'i1', supplier: 'Bobby', location: 'Godown > Ground Floor', qty: 10 },
];
const mine = groupByItem(rows).get('i1');
v = supplierItemView(item, mine, 'Arjun');
assert.deepEqual(v.lines.map((l) => [l.location, l.qty]), [['Godown > Ground Floor', 8], ['Mayapuri Shop > W-82/2', 12], ['', 10]]);
assert.equal(v.supplierStock, 30);
assert.equal(supplierItemView(item, mine, 'Bobby').supplierStock, 10);
assert.equal(unlocated(item, mine, 'Bobby'), 0);
assert.ok(isAssociated(item, mine, 'arjun'));
assert.ok(!isAssociated(item, mine, 'Nobody'));

// 5) validation of OUT / IN / MOVE
const ok = (e) => assert.equal(e, '');
const bad = (e) => assert.ok(e && e.length > 0);
ok(validateLocMove(item, mine, { type: 'OUT', qty: 12, supplier: 'Arjun', location: 'Mayapuri Shop > W-82/2' }));
bad(validateLocMove(item, mine, { type: 'OUT', qty: 13, supplier: 'Arjun', location: 'Mayapuri Shop > W-82/2' }));
ok(validateLocMove(item, mine, { type: 'IN', qty: 5, supplier: 'Arjun', location: 'Mayapuri Shop > W-82/4' }));
bad(validateLocMove(item, mine, { type: 'IN', qty: 5, supplier: '', location: 'Mayapuri Shop > W-82/4' }));
bad(validateLocMove(item, mine, { type: 'IN', qty: 5, supplier: 'Arjun', location: 'Nowhere' }));
// no-location OUT may only use the unlocated remainder (10)
ok(validateLocMove(item, mine, { type: 'OUT', qty: 10, supplier: 'Arjun', location: '' }));
bad(validateLocMove(item, mine, { type: 'OUT', qty: 11, supplier: 'Arjun', location: '' }));
// moves
ok(validateLocMove(item, mine, { type: 'MOVE', qty: 8, supplier: 'Arjun', location: 'Godown > Ground Floor', toLocation: 'Godown > Back Gali Shop' }));
bad(validateLocMove(item, mine, { type: 'MOVE', qty: 9, supplier: 'Arjun', location: 'Godown > Ground Floor', toLocation: 'Godown > Back Gali Shop' }));
bad(validateLocMove(item, mine, { type: 'MOVE', qty: 1, supplier: 'Arjun', location: 'Godown > Ground Floor', toLocation: 'Godown > Ground Floor' }));
ok(validateLocMove(item, mine, { type: 'MOVE', qty: 10, supplier: 'Arjun', location: '', toLocation: 'Godown > Ground Floor' }));
bad(validateLocMove(item, mine, { type: 'MOVE', qty: 11, supplier: 'Arjun', location: '', toLocation: 'Godown > Ground Floor' }));

// 6) "Any / not sure" OUT never touches located stock
assert.deepEqual(planOutAny(item, mine, 10), {}); // the 10 unassigned units go first
assert.deepEqual(planOutAny(item, mine, 20), { Arjun: 20 }); // then Arjun's stock that has no location
assert.equal(planOutAny(item, mine, 21), null); // the rest sits at locations -> must choose one

// 7) history filters work together
const G = 'Godown > Ground Floor', W = 'Mayapuri Shop > W-82/2';
const hist = [
  { id: 1, type: 'IN', by: 'u1', byName: 'Ravi', supplier: 'Arjun', itemId: 'i1', itemName: 'Silencer', location: G },
  { id: 2, type: 'OUT', by: 'u2', byName: 'Sam', supplier: 'Arjun', itemId: 'i1', itemName: 'Silencer', location: G },
  { id: 3, type: 'MOVE', by: 'u1', byName: 'Ravi', supplier: 'Arjun', itemId: 'i1', itemName: 'Silencer', location: G, toLocation: W },
  { id: 4, type: 'IN', by: 'u1', byName: 'Ravi', supplier: 'Bobby', itemId: 'i2', itemName: 'Gasket', location: W },
];
const hids = (f) => applyHistoryFilters(hist, f).map((m) => m.id);
assert.deepEqual(hids({ staff: 'u1' }), [1, 3, 4]);
assert.deepEqual(hids({ staff: 'u1', supplier: 'arjun' }), [1, 3]);
assert.deepEqual(hids({ staff: 'u1', supplier: 'Arjun', item: 'i1', location: W }), [3]); // location matches the destination of a move too
assert.deepEqual(hids({ staff: 'u1', supplier: 'Arjun', item: 'i1', location: G, type: 'IN' }), [1]);
assert.deepEqual(hids({ type: 'OUT', staff: 'u1' }), []);
assert.deepEqual(hids({ q: 'gasket', location: W }), [4]);
const r = resolveDateRange('custom', '2026-10-01', '2026-10-05');
assert.equal(r.to.getDate(), 6); // end date is included
assert.ok(resolveDateRange('custom', '2026-10-05', '2026-10-01').error);
console.log('LOCATION SELF-TESTS PASSED');

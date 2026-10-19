// Run: npm test   (checks search + importer against the shop's real sheet)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as XLSX from 'xlsx';
import { searchItems } from '../src/lib/search.js';
import { analyzeStock, planStock, analyzeSuppliers, planSuppliers, analyzePrices, planPrices } from '../src/lib/importer.js';
import { parseNumber, normalizeUnit } from '../src/lib/text.js';

const file = process.argv[2] || new URL('../sample-data/STOCK_MANAGEMENT_MAYAPURI.xlsx', import.meta.url).pathname;
const wb = XLSX.read(fs.readFileSync(file), { type: 'buffer' });
const rows = (n) => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null, blankrows: false });

// --- stock matrix
const a = analyzeStock(rows('Stock Data'));
assert.ok(!a.error, a.error);
assert.equal(a.headerIdx, 2);
assert.equal(a.supplierCols.length, 5);
const plan = planStock(a, a.supplierCols.filter((c) => c.enabled).map((c) => c.idx), []);
console.log('stock:', plan.newRows.length, 'new,', plan.skipped.length, 'skipped,', plan.invalid.length, 'invalid');
assert.equal(plan.newRows.length, 25);
assert.equal(plan.invalid.length, 0);
const mahin = plan.newRows.find((r) => r.name === 'Silencer Mahindra DI');
assert.equal(mahin.qty, 96);
assert.deepEqual(mahin.bySupplier, { Arjun: 96 });
const s407 = plan.newRows.find((r) => r.name === 'Silencer 407 Tata');
assert.equal(s407.qty, 17);
// re-import same file -> nothing new
const items = plan.newRows.map((r, i) => ({ ...r, id: 'i' + i }));
const again = planStock(a, a.supplierCols.map((c) => c.idx), items);
assert.equal(again.newRows.length, 0);
assert.equal(again.skipped.length, 25);

// --- suppliers
const sa = analyzeSuppliers(rows('Supplier'));
const sp = planSuppliers(sa, new Set());
console.log('suppliers:', sp.newRows.length, 'new');
assert.equal(sp.newRows.length, 5);

// --- prices
const pa = analyzePrices([['Supplier', 'Item', 'Part No', 'Rate', 'Unit'], ['Arjun', 'Silencer 407', 'S-407', '₹1,250.50', 'pc'], ['Arjun', 'Bad', '', 'abc', 'pcs'], ['', 'x', '', 5, 'pcs']]);
const pp = planPrices(pa, new Map());
assert.equal(pp.newRows.length, 1);
assert.equal(pp.newRows[0].price, 1250.5);
assert.equal(pp.invalid.length, 2);
const pp2 = planPrices(pa, new Map([[pp.newRows[0].id, { price: 1250.5 }]]));
assert.equal(pp2.skipped.length, 1);
const pp3 = planPrices(pa, new Map([[pp.newRows[0].id, { price: 1000 }]]));
assert.equal(pp3.updatedRows[0].prevPrice, 1000);

// --- search
const catalog = [
  { name: 'Carbon Brush Set', partNo: 'KB-221', brand: 'Kirloskar', model: 'DG 5kVA' },
  { name: 'Carbon Brush', partNo: 'CB-9', brand: 'Crompton', model: 'Motor 2HP' },
  { name: 'Silencer RB-66 3(1/4) Inch Big Bore', partNo: '', brand: '', model: '' },
];
assert.equal(searchItems(catalog, 'carbon brush kirloskar').length, 1);
assert.equal(searchItems(catalog, 'brush').length, 2);
assert.equal(searchItems(catalog, 'kirloskar carbon').length, 1);
assert.equal(searchItems(catalog, 'rb66').length, 1);
assert.equal(searchItems(catalog, 'dg 5kva').length, 1);
assert.equal(searchItems(catalog, 'nothing here').length, 0);

assert.equal(parseNumber('Rs. 1,200'), 1200);
assert.ok(Number.isNaN(parseNumber('abc')));
assert.equal(normalizeUnit('Pc'), 'pcs');
console.log('ALL SELF-TESTS PASSED');

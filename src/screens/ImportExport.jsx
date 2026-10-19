import { useEffect, useMemo, useRef, useState } from 'react';
import { useData } from '../state/DataContext';
import { Icon, Segmented, useToast } from '../ui/kit';
import { MAX_ROWS, pickSheet, planImport, summarize } from '../lib/importer';
import {
  HISTORY_COLUMNS, PRICE_EXPORT_COLUMNS, STOCK_COLUMNS, SUPPLIER_COLUMNS,
  downloadTemplate, exportGrid, exportTable, historyRows, priceRows, stockRows, supplierRows,
} from '../lib/exporter';
import { commitPriceImport, commitStockImport, commitSupplierImport } from '../lib/ops';
import { fetchAllHistory } from './History';
import { friendly } from '../lib/errors';

const KINDS = [
  { value: 'stock', label: 'Stock' },
  { value: 'prices', label: 'Supplier prices' },
  { value: 'suppliers', label: 'Supplier list' },
];
const MAX_BYTES = 5 * 1024 * 1024;

async function readWorkbook(file) {
  const XLSX = await import('@e965/xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: false });
  return wb.SheetNames.map((name) => ({
    name,
    aoa: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: null, raw: true, blankrows: true }),
  }));
}

const STATUS_LABEL = { new: 'New', update: 'Price changed', skip: 'Skipped', invalid: 'Invalid', merged: 'Merged' };

function Preview({ plan, kind }) {
  const [tab, setTab] = useState('all');
  const rows = plan.rows.filter((r) => tab === 'all' || (tab === 'problems' ? r.status === 'invalid' || r.status === 'skip' : r.status === tab));
  const c = plan.counts;
  return (
    <div className="preview">
      <div className="summary" aria-live="polite">
        <span className="pill new"><b>{c.new}</b> new</span>
        {kind === 'prices' && <span className="pill upd"><b>{c.updated}</b> price changed</span>}
        {c.merged > 0 && <span className="pill upd"><b>{c.merged}</b> merged</span>}
        <span className="pill skip"><b>{c.skipped}</b> skipped</span>
        <span className="pill bad"><b>{c.invalid}</b> invalid</span>
      </div>
      {plan.mapping?.layout === 'grid' && (
        <p className="small muted">Supplier grid detected: <b>{plan.mapping.name || 'Products'}</b> down the side, {plan.mapping.suppliers.length} supplier columns ({plan.mapping.suppliers.join(', ')}). Quantity = total across suppliers.</p>
      )}
      {plan.mapping?.layout === 'flat' && (
        <p className="small muted">Columns matched: {Object.entries(plan.mapping.columns).map(([f, h]) => `${f} ← “${h}”`).join(' · ')}</p>
      )}
      {plan.newSuppliers?.length > 0 && <p className="small muted">{plan.newSuppliers.length} new supplier name{plan.newSuppliers.length > 1 ? 's' : ''} will also be added to the supplier list.</p>}
      <div className="chips">
        {[['all', 'All'], ['new', 'New'], ...(kind === 'prices' ? [['update', 'Changed']] : []), ['problems', 'Skipped / invalid']].map(([v, l]) => (
          <button key={v} className={'chip' + (tab === v ? ' on' : '')} onClick={() => setTab(v)}>{l}</button>
        ))}
      </div>
      <div className="plan-list">
        {rows.slice(0, 120).map((r) => (
          <div key={r.rowNum} className={'plan-row ' + r.status}>
            <span className={'dot ' + r.status} aria-hidden="true" />
            <div>
              <div className="pl-title">{r.label}</div>
              <div className="pl-sub">{r.reason || r.detail}</div>
            </div>
            <span className="pl-status">{STATUS_LABEL[r.status]}<small>row {r.rowNum}</small></span>
          </div>
        ))}
        {rows.length > 120 && <p className="small muted">…and {rows.length - 120} more rows not shown.</p>}
        {rows.length === 0 && <p className="small muted">Nothing in this group.</p>}
      </div>
    </div>
  );
}

export default function ImportExport({ profile }) {
  const { items, dir, prices, online } = useData();
  const toast = useToast();
  const fileRef = useRef(null);
  const [kind, setKind] = useState('stock');
  const [file, setFile] = useState(null); // {name, sheets}
  const [sheetIdx, setSheetIdx] = useState(0);
  const [readErr, setReadErr] = useState('');
  const [reading, setReading] = useState(false);
  const [progress, setProgress] = useState(null);
  const [busy, setBusy] = useState('');

  useEffect(() => { if (file) setSheetIdx(pickSheet(kind, file.sheets)); }, [kind, file]);

  const plan = useMemo(
    () => (file ? planImport(kind, file.sheets[sheetIdx]?.aoa || [], { items, suppliers: dir, prices }) : null),
    [file, sheetIdx, kind, items, dir, prices],
  );
  const importable = plan && !plan.error ? plan.counts.new + plan.counts.updated : 0;

  async function onFile(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setReadErr(''); setFile(null);
    if (!/\.(xlsx|xls|csv)$/i.test(f.name)) { setReadErr('Please choose an Excel (.xlsx, .xls) or .csv file.'); return; }
    if (f.size > MAX_BYTES) { setReadErr('That file is too large (limit 5 MB).'); return; }
    setReading(true);
    try {
      const sheets = await readWorkbook(f);
      if (!sheets.length) throw new Error('The file has no sheets.');
      setFile({ name: f.name, sheets });
    } catch (err) { setReadErr('Could not read that file: ' + (err.message || 'unknown problem')); }
    setReading(false);
  }

  async function confirm() {
    if (!plan || plan.error || !importable) return;
    setProgress({ done: 0, total: importable });
    try {
      const onP = (done, total) => setProgress({ done, total });
      let n;
      if (kind === 'stock') n = await commitStockImport(profile, plan, file.name, onP);
      else if (kind === 'prices') n = await commitPriceImport(profile, plan, onP);
      else n = await commitSupplierImport(plan, onP);
      toast(`Imported ${n} ${kind === 'stock' ? 'items' : kind === 'prices' ? 'prices' : 'suppliers'}`);
      setFile(null);
    } catch (err) { setReadErr('Import stopped: ' + friendly(err) + ' Rows already saved stay saved — re-import the file to continue (existing rows are skipped).'); }
    setProgress(null);
  }

  async function run(label, fn) {
    setBusy(label);
    try { await fn(); } catch (err) { toast(friendly(err), 'error'); }
    setBusy('');
  }

  const fmtBtn = (label, onCsv, onXlsx, key) => (
    <div className="exp-row" key={key}>
      <div><b>{label}</b></div>
      <div className="exp-btns">
        {onCsv && <button className="btn ghost sm" disabled={!!busy} onClick={() => run(key + 'c', onCsv)}><Icon name="download" size={16} /> CSV</button>}
        {onXlsx && <button className="btn ghost sm" disabled={!!busy} onClick={() => run(key + 'x', onXlsx)}><Icon name="download" size={16} /> Excel</button>}
      </div>
    </div>
  );

  return (
    <div className="page-pad">
      <section className="card">
        <h2>Import</h2>
        <p className="muted small">Choose what you are importing, pick the file, check the preview, then confirm. Nothing is saved until you confirm. Limit: {MAX_ROWS} rows per import.</p>
        <Segmented value={kind} onChange={(v) => { setKind(v); }} options={KINDS} />
        <p className="small muted topgap">
          {kind === 'stock' && 'New items only — items already in the app are never changed. Works with a plain list, or a grid with one column per supplier.'}
          {kind === 'prices' && 'New prices are added; an existing price is changed only if the amount is different (the old price is kept as “was ₹…”).'}
          {kind === 'suppliers' && 'Supplier names (and what they deal in). Existing names are skipped.'}
        </p>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={onFile} hidden />
        <button className="btn primary big" onClick={() => fileRef.current?.click()} disabled={reading || !!progress}><Icon name="upload" /> {reading ? 'Reading file…' : file ? 'Choose a different file' : 'Choose file (.xlsx, .xls, .csv)'}</button>
        {readErr && <div className="banner error" role="alert">{readErr}</div>}

        {file && (
          <>
            <div className="file-line"><Icon name="file" size={18} /> <b>{file.name}</b></div>
            {file.sheets.length > 1 && (
              <label className="inline-field">Sheet to import
                <select value={sheetIdx} onChange={(e) => setSheetIdx(Number(e.target.value))}>
                  {file.sheets.map((s, i) => <option key={s.name} value={i}>{s.name}</option>)}
                </select>
              </label>
            )}
            {plan?.error && <div className="banner error" role="alert">{plan.error}</div>}
            {plan && !plan.error && (
              <>
                <h3 className="result-line">{summarize(plan)}</h3>
                <Preview plan={plan} kind={kind} />
                {!online && <div className="banner error">You are offline. Connect to the internet to import.</div>}
                {progress && (
                  <div className="progress" role="progressbar" aria-valuenow={progress.done} aria-valuemax={progress.total}>
                    <div style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} />
                    <span>Importing {progress.done} of {progress.total}…</span>
                  </div>
                )}
                <button className="btn in big" onClick={confirm} disabled={!importable || !online || !!progress}>
                  {importable ? `Confirm: import ${importable} ${kind === 'prices' ? 'price' + (importable > 1 ? 's' : '') : kind === 'stock' ? 'item' + (importable > 1 ? 's' : '') : 'supplier' + (importable > 1 ? 's' : '')}` : 'Nothing to import'}
                </button>
              </>
            )}
          </>
        )}
        <div className="templates">
          <span className="small muted">Blank template:</span>
          <button className="link" onClick={() => run('t', () => downloadTemplate('all'))}>Excel (all 3 sheets)</button>
          <button className="link" onClick={() => run('t1', () => downloadTemplate('stock'))}>Stock CSV</button>
          <button className="link" onClick={() => run('t2', () => downloadTemplate('prices'))}>Prices CSV</button>
          <button className="link" onClick={() => run('t3', () => downloadTemplate('suppliers'))}>Suppliers CSV</button>
        </div>
        <details className="small muted">
          <summary>Which column headings are understood?</summary>
          <p><b>Stock:</b> Name / Item / Product(s) · Part No / Code · Brand / Make · Model / Compatible model · Qty / Quantity / Stock / Pieces · Unit / UOM · Min Stock / Reorder level · Supplier.</p>
          <p><b>Supplier prices:</b> Supplier / Manufacturer · Item / Product · Part No · Price / Rate / Cost · Unit · Note / Remarks.</p>
          <p><b>Grid:</b> a “Products” column and then one column per supplier with pieces in the cells (like your paper sheet).</p>
        </details>
      </section>

      <section className="card">
        <h2>Export</h2>
        <p className="muted small">Same column headings as the import templates, so an exported file can be imported again.</p>
        {fmtBtn('Stock', () => exportTable('stock', 'csv', STOCK_COLUMNS, stockRows(items)), () => exportTable('stock', 'xlsx', STOCK_COLUMNS, stockRows(items), 'Stock'), 'stock')}
        {fmtBtn('Stock — supplier grid (like your sheet)', null, () => exportGrid(items), 'grid')}
        {fmtBtn('Supplier prices', () => exportTable('supplier-prices', 'csv', PRICE_EXPORT_COLUMNS, priceRows(prices)), () => exportTable('supplier-prices', 'xlsx', PRICE_EXPORT_COLUMNS, priceRows(prices), 'Supplier Prices'), 'prices')}
        {fmtBtn('Supplier list', () => exportTable('suppliers', 'csv', SUPPLIER_COLUMNS, supplierRows(dir)), () => exportTable('suppliers', 'xlsx', SUPPLIER_COLUMNS, supplierRows(dir), 'Suppliers'), 'sup')}
        {fmtBtn('History (all entries)',
          async () => exportTable('history', 'csv', HISTORY_COLUMNS, historyRows(await fetchAllHistory())),
          async () => exportTable('history', 'xlsx', HISTORY_COLUMNS, historyRows(await fetchAllHistory()), 'History'), 'hist')}
        {busy && <p className="small muted">Preparing file…</p>}
      </section>
    </div>
  );
}

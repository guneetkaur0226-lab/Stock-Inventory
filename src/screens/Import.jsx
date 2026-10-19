import { useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth.jsx';
import { useData } from '../store.jsx';
import { importPrices, importStock, importSuppliers } from '../db.js';
import { analyzePrices, analyzeStock, analyzeSuppliers, guessSheet, MAX_ROWS, planPrices, planStock, planSuppliers, readSpreadsheet } from '../lib/importer.js';
import { downloadXlsx } from '../lib/csv.js';
import { TEMPLATE_SHEETS } from '../lib/exporter.js';
import { slug } from '../lib/text.js';
import { fmtNum, fmtINR } from '../lib/format.js';
import { Icon, Segmented, useToast } from '../components/ui.jsx';

const KINDS = [
  { value: 'stock', label: 'Stock' },
  { value: 'prices', label: 'Supplier prices' },
  { value: 'suppliers', label: 'Supplier names' },
];

export default function Import() {
  const auth = useAuth();
  const { items, prices, suppliers, online } = useData();
  const toast = useToast();
  const fileRef = useRef(null);
  const [kind, setKind] = useState('stock');
  const [sheets, setSheets] = useState(null);
  const [fileName, setFileName] = useState('');
  const [sheetIdx, setSheetIdx] = useState(0);
  const [off, setOff] = useState({}); // supplier columns switched off
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [readErr, setReadErr] = useState('');

  const rows = sheets?.[sheetIdx]?.rows;

  const analysis = useMemo(() => {
    if (!rows) return null;
    if (kind === 'stock') return analyzeStock(rows);
    if (kind === 'prices') return analyzePrices(rows);
    return analyzeSuppliers(rows);
  }, [rows, kind]);

  const supplierIds = useMemo(() => new Set(suppliers.map((s) => s.id)), [suppliers]);

  const plan = useMemo(() => {
    if (!analysis || analysis.error) return null;
    if (kind === 'stock') {
      const enabled = analysis.supplierCols.filter((c) => c.enabled && !off[c.idx]).map((c) => c.idx);
      return planStock(analysis, enabled, items);
    }
    if (kind === 'prices') return planPrices(analysis, new Map(prices.map((p) => [p.id, p])));
    return planSuppliers(analysis, supplierIds);
  }, [analysis, kind, items, prices, supplierIds, off]);

  async function onFile(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setReadErr('');
    if (!/\.(xlsx|xls|csv)$/i.test(f.name)) return setReadErr('Please choose an .xlsx, .xls or .csv file.');
    try {
      const s = await readSpreadsheet(f);
      if (!s.length) return setReadErr('That file has no sheets.');
      setSheets(s);
      setFileName(f.name);
      setOff({});
      setSheetIdx(guessSheet(s, kind));
    } catch (err) {
      setReadErr(`Could not read that file: ${err.message}`);
    }
  }

  const adds = plan ? plan.newRows.length + (plan.updatedRows?.length || 0) : 0;
  const canConfirm = plan && !plan.tooMany && adds > 0 && !busy;

  async function confirm() {
    if (!online) return toast('Importing needs an internet connection.', 'err');
    setBusy(true);
    const onProgress = (d, t) => setProgress(`Saved ${d} of ${t}…`);
    try {
      const user = { uid: auth.fbUser.uid, name: auth.name, email: auth.fbUser.email };
      if (kind === 'stock') await importStock({ rows: plan.newRows, user, existingSupplierIds: supplierIds, onProgress });
      else if (kind === 'prices') await importPrices({ rows: [...plan.newRows, ...plan.updatedRows], user, existingSupplierIds: supplierIds, onProgress });
      else await importSuppliers({ rows: plan.newRows, onProgress });
      toast(`Imported ${adds} row${adds === 1 ? '' : 's'}`);
      setSheets(null);
      setFileName('');
    } catch (err) {
      toast(`Import stopped: ${err.message}. Rows saved before the error stay saved; importing again skips them.`, 'err', 12000);
    }
    setProgress('');
    setBusy(false);
  }

  return (
    <>
      <Segmented
        value={kind}
        onChange={(k) => {
          setKind(k);
          if (sheets) setSheetIdx(guessSheet(sheets, k));
        }}
        options={KINDS}
      />
      <p className="muted tiny">
        {kind === 'stock' && 'Adds new items only — items already in the app are never changed. Works with a plain list (Name, Part No, Qty…) or a products × suppliers table like your diary sheet.'}
        {kind === 'prices' && 'Needs Supplier, Item and Price (or Rate) columns. New prices are added; an existing price is changed only if the amount is different.'}
        {kind === 'suppliers' && 'Needs a Supplier column; a Reference / Note column is optional.'} Up to {MAX_ROWS} rows at a time.
      </p>

      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv" hidden onChange={onFile} />
      <div className="row gap">
        <button className="btn primary big grow" onClick={() => fileRef.current.click()} disabled={busy}>
          <Icon name="upload" size={20} /> {fileName ? 'Choose a different file' : 'Choose file'}
        </button>
        <button className="btn" onClick={() => downloadXlsx('import-template.xlsx', TEMPLATE_SHEETS)}>
          <Icon name="download" size={18} /> Template
        </button>
      </div>
      {readErr && <div className="notice err">{readErr}</div>}

      {sheets && (
        <div className="card pad">
          <div className="muted tiny">File: <b>{fileName}</b></div>
          {sheets.length > 1 && (
            <label className="field inline">
              <span>Sheet to import</span>
              <select value={sheetIdx} onChange={(e) => { setSheetIdx(+e.target.value); setOff({}); }}>
                {sheets.map((s, i) => (
                  <option key={s.name} value={i}>{s.name} ({s.rows.length} rows)</option>
                ))}
              </select>
            </label>
          )}

          {analysis?.error && <div className="notice err">{analysis.error} Try another sheet or another import type above.</div>}

          {plan && (
            <>
              {kind === 'stock' && analysis.supplierCols.length > 0 && (
                <div className="supcols">
                  <b>Supplier columns found</b>
                  <p className="muted tiny">Each number is stock held from that supplier. Untick anything that is not a supplier.</p>
                  {analysis.supplierCols.map((c) => (
                    <label key={c.idx} className="check">
                      <input
                        type="checkbox"
                        checked={c.enabled && !off[c.idx]}
                        disabled={!c.enabled}
                        onChange={(e) => setOff((o) => ({ ...o, [c.idx]: !e.target.checked }))}
                      />
                      <span>{c.name}</span>
                      {!c.enabled && <span className="muted tiny"> (not numbers — ignored)</span>}
                    </label>
                  ))}
                </div>
              )}

              <div className="summary" role="status">
                <span className="pill good">{plan.newRows.length} new</span>
                {plan.updatedRows && <span className="pill t-EDIT">{plan.updatedRows.length} price changed</span>}
                <span className="pill">{plan.skipped.length} skipped</span>
                <span className={`pill ${plan.invalid.length ? 'bad' : ''}`}>{plan.invalid.length} invalid</span>
              </div>

              {plan.tooMany && (
                <div className="notice err">
                  This sheet has {plan.total} rows. The limit is {MAX_ROWS} per import. Split the file into smaller parts and import them one by one.
                </div>
              )}

              <Preview title="Will be added" rows={[...plan.newRows, ...(plan.updatedRows || [])]} kind={kind} open />
              <Problems title="Skipped" list={plan.skipped} />
              <Problems title="Invalid (will not be imported)" list={plan.invalid} bad />

              <button className="btn primary big" disabled={!canConfirm} onClick={confirm}>
                {busy ? progress || 'Importing…' : adds ? `Confirm import of ${adds} row${adds === 1 ? '' : 's'}` : 'Nothing to import'}
              </button>
              {!online && <div className="notice err">You are offline. Importing needs internet.</div>}
            </>
          )}
        </div>
      )}
    </>
  );
}

function Preview({ title, rows, kind, open }) {
  const [o, setO] = useState(!!open);
  if (!rows.length) return null;
  return (
    <details open={o} onToggle={(e) => setO(e.target.open)} className="det">
      <summary>{title} ({rows.length})</summary>
      <ul className="plain">
        {rows.slice(0, 40).map((r) => (
          <li key={r.rowNo + r.name + (r.item || '')}>
            {kind === 'stock' && (
              <>
                <b>{r.name}</b> <span className="muted">— {fmtNum(r.qty)} {r.unit}{Object.keys(r.bySupplier).length ? ` (${Object.entries(r.bySupplier).map(([k, v]) => `${k}: ${v}`).join(', ')})` : ''}</span>
              </>
            )}
            {kind === 'prices' && (
              <>
                <b>{r.supplier}</b> — {r.item} <span className="muted">{fmtINR(r.price)}{r.prevPrice != null ? ` (was ${fmtINR(r.prevPrice)})` : ''}</span>
              </>
            )}
            {kind === 'suppliers' && (
              <>
                <b>{r.name}</b> <span className="muted">{r.note}</span>
              </>
            )}
          </li>
        ))}
        {rows.length > 40 && <li className="muted">…and {rows.length - 40} more</li>}
      </ul>
    </details>
  );
}

function Problems({ title, list, bad }) {
  if (!list.length) return null;
  return (
    <details className="det">
      <summary className={bad ? 'bad-t' : ''}>{title} ({list.length})</summary>
      <ul className="plain">
        {list.slice(0, 60).map((r) => (
          <li key={r.rowNo + r.name}>
            <span className="muted">Row {r.rowNo}:</span> <b>{r.name}</b> — {r.reason}
          </li>
        ))}
        {list.length > 60 && <li className="muted">…and {list.length - 60} more</li>}
      </ul>
    </details>
  );
}

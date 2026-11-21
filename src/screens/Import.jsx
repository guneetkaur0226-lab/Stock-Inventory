import { useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth.jsx';
import { useData } from '../store.jsx';
import { runRestore } from '../lib/restoreRun.js';
import { analyzeStock, guessSheet, MAX_ROWS, planStock, readSpreadsheet } from '../lib/importer.js';
import { findSheet, parseLocationsSheet, parseSuppliersSheet, planRelinks } from '../lib/restore.js';
import { slug } from '../lib/text.js';
import { Icon, useToast } from '../components/ui.jsx';

/** Restore: reads a backup file and adds whatever is missing. Existing items are never changed. */
export default function Restore() {
  const auth = useAuth();
  const { items, suppliers, locStock, online } = useData();
  const toast = useToast();
  const fileRef = useRef(null);
  const live = useRef({ items, locStock });
  live.current = { items, locStock };
  const [sheets, setSheets] = useState(null);
  const [fileName, setFileName] = useState('');
  const [readErr, setReadErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState('');

  const supplierIds = useMemo(() => new Set(suppliers.map((s) => s.id)), [suppliers]);

  // what the file would add
  const preview = useMemo(() => {
    if (!sheets) return null;
    const stockSheet = findSheet(sheets, /^stock$/i) || sheets[guessSheet(sheets, 'stock')];
    const analysis = analyzeStock(stockSheet?.rows || []);
    const stockPlan = analysis.error ? null : planStock(analysis, analysis.supplierCols.filter((c) => c.enabled).map((c) => c.idx), items);
    const supSheet = findSheet(sheets, /^supplier/i);
    const newSuppliers = parseSuppliersSheet(supSheet?.rows).filter((s) => !supplierIds.has(slug(s.name)));
    const locSheet = findSheet(sheets, /^location/i);
    const locations = parseLocationsSheet(locSheet?.rows);
    const enabled = analysis.error ? [] : analysis.supplierCols.filter((c) => c.enabled).map((c) => c.idx);
    const relinks = planRelinks(analysis, enabled, items);
    return { analysis, enabled, stockPlan, newSuppliers, locations, relinks };
  }, [sheets, items, supplierIds]);

  async function onFile(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setReadErr('');
    setResult('');
    try {
      const s = await readSpreadsheet(f);
      if (!s.length) return setReadErr('That file is empty.');
      setSheets(s);
      setFileName(f.name);
    } catch (err) {
      setReadErr(`Could not read that file. Please choose a backup file saved from this app. (${err.message})`);
    }
  }

  const addItems = preview?.stockPlan?.newRows.length || 0;
  const addSuppliers = preview?.newSuppliers.length || 0;
  const locCount = preview?.locations.rows.length || 0;
  const relinkCount = preview?.relinks.length || 0;
  const tooMany = preview?.stockPlan?.tooMany;
  const nothing = !addItems && !addSuppliers && !locCount && !relinkCount;

  async function restore() {
    if (!online) return toast('Restore needs an internet connection.', 'err');
    setBusy(true);
    setResult('');
    const user = { uid: auth.fbUser.uid, name: auth.name, email: auth.fbUser.email };
    try {
      const r = await runRestore({
        preview,
        supplierIds,
        getItems: () => live.current.items,
        getLocStock: () => live.current.locStock,
        user,
        onProgress: setProgress,
      });
      const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
      let msg = `Restore finished. Added ${plural(r.added, 'item', 'items')}, ${plural(r.newSuppliers, 'supplier', 'suppliers')}, reconnected ${plural(r.relinked, 'existing item', 'existing items')} to their suppliers and placed ${plural(r.placed, 'location entry', 'location entries')}.`;
      if (r.skipped) msg += ` ${plural(r.skipped, 'location entry was', 'location entries were')} skipped${r.reasons.length ? ` (${r.reasons.join('; ')})` : ''}.`;
      setResult(msg);
      toast('Restore finished');
      setSheets(null);
      setFileName('');
    } catch (err) {
      toast(`Restore stopped: ${err.message}. What was added stays saved; you can run the restore again and it will skip it.`, 'err', 12000);
    }
    setProgress('');
    setBusy(false);
  }

  return (
    <>
      <p className="muted tiny">
        Choose a backup file you saved earlier (More → Backup). Restore <b>adds what is missing</b> and reconnects suppliers to items that lost them. It never changes item names, details or stock totals.
      </p>
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={onFile} />
      <button className="btn primary big" onClick={() => fileRef.current.click()} disabled={busy}>
        <Icon name="upload" size={20} /> {fileName ? 'Choose a different file' : 'Choose backup file'}
      </button>
      {readErr && <div className="notice err">{readErr}</div>}
      {result && <div className="notice">{result}</div>}

      {preview && (
        <div className="card pad">
          <div className="muted tiny">
            File: <b>{fileName}</b>
          </div>
          {preview.analysis.error && !addSuppliers && !locCount ? (
            <div className="notice err">This does not look like a backup file from this app.</div>
          ) : (
            <>
              <p>
                New items to add: <b>{addItems}</b>
                {preview.stockPlan?.skipped.length ? <span className="muted"> ({preview.stockPlan.skipped.length} already in the app)</span> : null}
                <br />
                New suppliers to add: <b>{addSuppliers}</b>
                <br />
                Existing items to reconnect to their supplier: <b>{relinkCount}</b>
                <br />
                Location entries to restore: <b>{locCount}</b>
              </p>
              {preview.stockPlan?.invalid.length > 0 && (
                <div className="notice err">{preview.stockPlan.invalid.length} item row(s) in the file have a problem and will be skipped.</div>
              )}
              {tooMany && <div className="notice err">The file has more than {MAX_ROWS} items. Please restore it in smaller parts.</div>}
              {preview.locations.tooMany && <div className="notice err">Only the first part of the location entries will be restored.</div>}
              <button className="btn primary big" onClick={restore} disabled={busy || nothing || tooMany}>
                {busy ? progress || 'Restoring…' : 'Restore now'}
              </button>
              {nothing && <p className="muted tiny">Nothing new to restore. Everything in this file is already in the app.</p>}
            </>
          )}
        </div>
      )}
    </>
  );
}

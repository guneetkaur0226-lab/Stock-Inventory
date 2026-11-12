import { useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth.jsx';
import { useData } from '../store.jsx';
import { importStock, moveStock, restoreSuppliers } from '../db.js';
import { analyzeStock, guessSheet, MAX_ROWS, planStock, readSpreadsheet } from '../lib/importer.js';
import { findItem, findSheet, parseLocationsSheet, parseSuppliersSheet, sameName } from '../lib/restore.js';
import { rowsForSupplier } from '../lib/stockLoc.js';
import { slug } from '../lib/text.js';
import { Icon, useToast } from '../components/ui.jsx';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

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
    const stockSheet = sheets[guessSheet(sheets, 'stock')];
    const analysis = analyzeStock(stockSheet?.rows || []);
    const stockPlan = analysis.error ? null : planStock(analysis, analysis.supplierCols.filter((c) => c.enabled).map((c) => c.idx), items);
    const supSheet = findSheet(sheets, /^supplier/i);
    const newSuppliers = parseSuppliersSheet(supSheet?.rows).filter((s) => !supplierIds.has(slug(s.name)));
    const locSheet = findSheet(sheets, /^location/i);
    const locations = parseLocationsSheet(locSheet?.rows);
    return { analysis, stockPlan, newSuppliers, locations };
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
  const tooMany = preview?.stockPlan?.tooMany;
  const nothing = !addItems && !addSuppliers && !locCount;

  async function restore() {
    if (!online) return toast('Restore needs an internet connection.', 'err');
    setBusy(true);
    setResult('');
    const user = { uid: auth.fbUser.uid, name: auth.name, email: auth.fbUser.email };
    try {
      const newSup = preview.newSuppliers;
      if (newSup.length) await restoreSuppliers({ rows: newSup });

      const rows = preview.stockPlan?.newRows || [];
      if (rows.length) {
        const known = new Set([...supplierIds, ...newSup.map((s) => slug(s.name))]);
        await importStock({ rows, user, existingSupplierIds: known, onProgress: (d, t) => setProgress(`Adding items… ${d} of ${t}`) });
        // wait until the new items are visible in the app before placing them at locations
        for (let i = 0; i < 30; i++) {
          const have = live.current.items;
          if (rows.every((r) => findItem(have, r.name, r.partNo))) break;
          await wait(500);
        }
      }

      let placed = 0;
      let skipped = 0;
      const local = new Map(); // item id -> its location rows, kept up to date while restoring
      const locRows = preview.locations.rows;
      for (let i = 0; i < locRows.length; i++) {
        setProgress(`Placing stock at locations… ${i + 1} of ${locRows.length}`);
        const r = locRows[i];
        const item = findItem(live.current.items, r.item, r.partNo);
        if (!item) {
          skipped++;
          continue;
        }
        if (!local.has(item.id)) local.set(item.id, live.current.locStock.filter((x) => x.itemId === item.id));
        const itemRows = local.get(item.id);
        if (rowsForSupplier(itemRows, r.supplier).some((x) => x.location === r.location)) {
          skipped++; // already there
          continue;
        }
        try {
          await moveStock({ item, supplier: r.supplier, from: '', to: r.location, qty: r.qty, itemRows, note: 'Restored from backup', user });
          itemRows.push({ id: `${slug(r.supplier)}__${item.id}__${slug(r.location)}`, itemId: item.id, supplier: r.supplier, location: r.location, qty: r.qty });
          placed++;
        } catch {
          skipped++;
        }
      }

      const msg = `Restore finished. Added ${rows.length} item${rows.length === 1 ? '' : 's'}, ${newSup.length} supplier${newSup.length === 1 ? '' : 's'} and ${placed} location entr${placed === 1 ? 'y' : 'ies'}.${skipped ? ` ${skipped} location entr${skipped === 1 ? 'y was' : 'ies were'} skipped (already present, or the stock did not match).` : ''}`;
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
        Choose a backup file you saved earlier (More → Backup). Restore <b>only adds what is missing</b>: items, suppliers and locations that are already in the app are never changed.
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

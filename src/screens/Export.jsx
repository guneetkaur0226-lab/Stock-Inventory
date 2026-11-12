import { useState } from 'react';
import { useData } from '../store.jsx';
import { downloadXlsx } from '../lib/csv.js';
import { backupSheets } from '../lib/exporter.js';
import { Icon, useToast } from '../components/ui.jsx';

const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Backup: one file with all stock, suppliers and locations. */
export default function Backup() {
  const { items, suppliers, locStock } = useData();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      await downloadXlsx(`Mayapuri_Stock_Backup-${localDate()}.xlsx`, backupSheets({ items, suppliers, locStock }));
      toast('Backup saved to your phone');
    } catch (e) {
      toast(`Backup failed: ${e.message}`, 'err');
    }
    setBusy(false);
  }

  return (
    <div className="card pad">
      <b>Save a backup</b>
      <p className="muted tiny">
        Saves everything in one file: all items with their stock, your suppliers, and the quantity of every supplier’s item at each location.
        Keep the file safe, for example in Google Drive.
      </p>
      <p>
        <b>{items.length}</b> items · <b>{suppliers.length}</b> suppliers · <b>{locStock.length}</b> location entries
      </p>
      <button className="btn primary big" onClick={run} disabled={busy}>
        <Icon name="download" size={20} /> {busy ? 'Preparing…' : 'Download full backup'}
      </button>
      <p className="muted tiny">History is not part of the backup. Download it from the History tab.</p>
    </div>
  );
}

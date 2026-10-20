import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth.jsx';
import { useData } from '../store.jsx';
import { PURGE_MIN_DAYS, countHistory, fetchAllMovements, purgeHistory } from '../db.js';
import { downloadCsv } from '../lib/csv.js';
import { historyRows } from '../lib/exporter.js';
import { Field, Icon, Segmented, Spinner, useConfirm, useToast } from '../components/ui.jsx';

const KEEP_OPTIONS = [
  { value: '60', label: '60 days' },
  { value: '90', label: '90 days' },
  { value: '180', label: '6 months' },
  { value: '365', label: '1 year' },
];
const WORD = 'PURGE';

/** Owner only. Deletes OLD history entries to free Firestore storage. Never touches stock. */
export default function PurgeHistory() {
  const { isOwner } = useAuth();
  const { items, online } = useData();
  const toast = useToast();
  const confirm = useConfirm();
  const [keepDays, setKeepDays] = useState('180');
  const [counts, setCounts] = useState(null); // { total, old } | null while loading | 'err'
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState('');
  const [progress, setProgress] = useState(0);
  const [tick, setTick] = useState(0);

  const cutoff = useMemo(() => new Date(Date.now() - Number(keepDays) * 86400000), [keepDays, tick]);
  // Each item's latest history entry is always kept.
  const keepIds = useMemo(() => new Set(items.map((i) => i.lastMoveId).filter(Boolean)), [items]);

  useEffect(() => {
    if (!isOwner || !online) return undefined;
    let live = true;
    setCounts(null);
    Promise.all([countHistory(), countHistory(cutoff)])
      .then(([total, old]) => live && setCounts({ total, old }))
      .catch(() => live && setCounts('err'));
    return () => {
      live = false;
    };
  }, [isOwner, online, cutoff]);

  if (!isOwner) return <div className="notice err">Only the owner can purge history.</div>;

  async function backup() {
    setBusy('backup');
    try {
      const all = await fetchAllMovements();
      downloadCsv(`history-backup-${new Date().toISOString().slice(0, 10)}.csv`, historyRows(all));
      toast(`Backup downloaded (${all.length} entries)`);
    } catch (e) {
      toast(`Backup failed: ${e.message}. You need internet for this.`, 'err');
    }
    setBusy('');
  }

  async function run() {
    const n = counts?.old || 0;
    const ok = await confirm({
      title: 'Delete old history?',
      message: `About ${n} history entries older than ${KEEP_OPTIONS.find((o) => o.value === keepDays).label} will be permanently deleted. Your stock, items, suppliers and prices are NOT touched. This cannot be undone.`,
      okText: 'Delete history',
      danger: true,
    });
    if (!ok) return;
    setBusy('purge');
    setProgress(0);
    try {
      const r = await purgeHistory({ olderThan: cutoff, keepIds, onProgress: setProgress });
      toast(r.more ? `Deleted ${r.deleted} entries. Run it again to delete more.` : `Done. Deleted ${r.deleted} old history entries.`);
      setTyped('');
      setTick((t) => t + 1);
    } catch (e) {
      toast(e.code === 'resource-exhausted' ? 'Daily free limit reached. Try again tomorrow.' : `Could not delete: ${e.message}`, 'err');
    }
    setBusy('');
  }

  const ready = typed.trim().toUpperCase() === WORD && counts && counts !== 'err' && counts.old > 0 && online && !busy;

  return (
    <>
      <div className="card pad">
        <b>Free up storage</b>
        <p className="muted tiny">
          Deletes only old <b>history entries</b> (the log in the History tab). Your <b>current stock, items, suppliers and prices are never touched</b>. Each item’s
          most recent history entry is always kept, and entries newer than {PURGE_MIN_DAYS} days can never be deleted.
        </p>
      </div>

      <div className="card pad">
        <b>1. Download a backup first (recommended)</b>
        <p className="muted tiny">Saves every history entry as a CSV file you can keep in Google Drive.</p>
        <button className="btn" onClick={backup} disabled={!!busy || !online}>
          <Icon name="download" size={18} /> {busy === 'backup' ? 'Preparing…' : 'Download full history (CSV)'}
        </button>
      </div>

      <div className="card pad form">
        <b>2. Keep history for the last…</b>
        <Segmented value={keepDays} onChange={setKeepDays} options={KEEP_OPTIONS} />
        {!online ? (
          <p className="muted tiny">You are offline. Connect to the internet to purge history.</p>
        ) : counts === null ? (
          <Spinner label="Counting entries…" />
        ) : counts === 'err' ? (
          <div className="notice err">Could not count history entries. Check your internet and try again.</div>
        ) : (
          <p>
            Total history: <b>{counts.total}</b> entries. Older than {KEEP_OPTIONS.find((o) => o.value === keepDays).label}: <b>{counts.old}</b> entries.
          </p>
        )}

        <Field label={`Type ${WORD} to unlock`} htmlFor="purge-word">
          <input id="purge-word" value={typed} onChange={(e) => setTyped(e.target.value)} autoCapitalize="characters" autoComplete="off" disabled={!!busy} />
        </Field>
        <button className="btn danger" onClick={run} disabled={!ready}>
          <Icon name="trash" size={18} /> {busy === 'purge' ? `Deleting… ${progress}` : 'Delete old history'}
        </button>
        <p className="muted tiny">Up to about 5,000 entries are deleted per run to stay within the free daily limits. If more remain, run it again (tomorrow if a limit message appears).</p>
      </div>
    </>
  );
}

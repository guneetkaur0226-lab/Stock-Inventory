import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth.jsx';
import { useData } from '../store.jsx';
import { countHistory, fetchAllMovements, purgeHistory } from '../db.js';
import { downloadCsv } from '../lib/csv.js';
import { historyRows } from '../lib/exporter.js';
import { Field, Icon, Spinner, useConfirm, useToast } from '../components/ui.jsx';

const DAY = 86400000;
// How to choose what to delete. "recent" = entries from the last N days; "older" = entries older than N days.
const RANGE_OPTIONS = [
  { value: 'd1', group: 'Recent history', label: 'Last day (24 hours)', kind: 'recent', days: 1 },
  { value: 'd7', group: 'Recent history', label: 'Last 7 days', kind: 'recent', days: 7 },
  { value: 'd30', group: 'Recent history', label: 'Last 30 days', kind: 'recent', days: 30 },
  { value: 'o60', group: 'Old history (everything older than…)', label: 'Older than 60 days', kind: 'older', days: 60 },
  { value: 'o90', group: 'Old history (everything older than…)', label: 'Older than 90 days', kind: 'older', days: 90 },
  { value: 'o180', group: 'Old history (everything older than…)', label: 'Older than 6 months', kind: 'older', days: 180 },
  { value: 'o365', group: 'Old history (everything older than…)', label: 'Older than 1 year', kind: 'older', days: 365 },
  { value: 'custom', group: 'Your own dates', label: 'Custom date range', kind: 'custom' },
];
const GROUPS = [...new Set(RANGE_OPTIONS.map((o) => o.group))];
const WORD = 'PURGE';

const fmtDay = (d) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtDayTime = (d) => d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** "2026-10-20" -> local midnight of that day (null if not a real date). */
function dayStart(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || '');
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Works out { from, to, label } (from inclusive, to exclusive) or { error } for the chosen option. */
function resolveRange(choice, now, customFrom, customTo) {
  const opt = RANGE_OPTIONS.find((o) => o.value === choice);
  if (opt.kind === 'recent') {
    const from = new Date(now - opt.days * DAY);
    return { from, to: new Date(now), label: `from ${fmtDayTime(from)} until now (${opt.label.toLowerCase()})`, short: opt.label.toLowerCase(), recent: true };
  }
  if (opt.kind === 'older') {
    const to = new Date(now - opt.days * DAY);
    return { from: null, to, label: `before ${fmtDayTime(to)} (${opt.label.toLowerCase()})`, short: opt.label.toLowerCase(), recent: false };
  }
  const f = dayStart(customFrom);
  const t = dayStart(customTo);
  if (!f || !t) return { error: 'Choose both a start date and an end date.' };
  if (t < f) return { error: 'The end date must not be before the start date.' };
  const today = dayStart(isoDay(new Date(now)));
  if (f > today) return { error: 'The start date cannot be in the future.' };
  const to = new Date(Math.min(t.getTime() + DAY, now)); // end date is included, but never beyond "now"
  const same = isoDay(f) === isoDay(t);
  return { from: f, to, label: same ? `on ${fmtDay(f)}` : `from ${fmtDay(f)} to ${fmtDay(t)} (both days included)`, short: same ? fmtDay(f) : `${fmtDay(f)} – ${fmtDay(t)}`, recent: true };
}

/** Owner only. Deletes OLD history entries to free Firestore storage. Never touches stock. */
export default function PurgeHistory() {
  const { isOwner } = useAuth();
  const { items, online } = useData();
  const toast = useToast();
  const confirm = useConfirm();
  const [choice, setChoice] = useState('o180');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [counts, setCounts] = useState(null); // { total, old } | null while loading | 'err' | 'none' (no valid range yet)
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState('');
  const [progress, setProgress] = useState(0);
  const [tick, setTick] = useState(0);

  const range = useMemo(() => resolveRange(choice, Date.now(), customFrom, customTo), [choice, customFrom, customTo, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const fromMs = range.from ? range.from.getTime() : 0;
  const toMs = range.to ? range.to.getTime() : 0;
  // Each item's latest history entry is always kept.
  const keepIds = useMemo(() => new Set(items.map((i) => i.lastMoveId).filter(Boolean)), [items]);

  useEffect(() => {
    if (!isOwner || !online) return undefined;
    if (range.error) {
      setCounts('none');
      return undefined;
    }
    let live = true;
    setCounts(null);
    Promise.all([countHistory(), countHistory({ from: range.from, to: range.to })])
      .then(([total, old]) => live && setCounts({ total, old }))
      .catch(() => live && setCounts('err'));
    return () => {
      live = false;
    };
  }, [isOwner, online, range.error, fromMs, toMs]); // eslint-disable-line react-hooks/exhaustive-deps

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
      title: 'Delete history?',
      message: `Up to ${n} history entries ${range.label} will be permanently deleted. Each item’s latest history entry is kept. Your stock, items, suppliers and prices are NOT touched. This cannot be undone.`,
      okText: 'Delete history',
      danger: true,
    });
    if (!ok) return;
    setBusy('purge');
    setProgress(0);
    try {
      const r = await purgeHistory({ from: range.from, to: range.to, keepIds, onProgress: setProgress });
      toast(r.more ? `Deleted ${r.deleted} entries. Run it again to delete more.` : `Done. Deleted ${r.deleted} history entries.`);
      setTyped('');
      setTick((t) => t + 1);
    } catch (e) {
      toast(e.code === 'resource-exhausted' ? 'Daily free limit reached. Try again tomorrow.' : `Could not delete: ${e.message}`, 'err');
    }
    setBusy('');
  }

  const ready = typed.trim().toUpperCase() === WORD && counts && typeof counts === 'object' && counts.old > 0 && !range.error && online && !busy;

  return (
    <>
      <div className="card pad">
        <b>Free up storage</b>
        <p className="muted tiny">
          Deletes only <b>history entries</b> (the log in the History tab) inside the time range you choose. Your <b>current stock, items, suppliers and prices are never touched</b>.
          Each item’s most recent history entry is always kept, so every item still shows its last change.
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
        <b>2. Choose which history to delete</b>
        <Field label="Time range" htmlFor="purge-range">
          <select id="purge-range" value={choice} onChange={(e) => { setChoice(e.target.value); setTyped(''); }} disabled={!!busy}>
            {GROUPS.map((g) => (
              <optgroup key={g} label={g}>
                {RANGE_OPTIONS.filter((o) => o.group === g).map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>
        {choice === 'custom' && (
          <div className="grid2">
            <Field label="From date" htmlFor="purge-from">
              <input id="purge-from" type="date" max={isoDay(new Date())} value={customFrom} onChange={(e) => { setCustomFrom(e.target.value); setTyped(''); }} disabled={!!busy} />
            </Field>
            <Field label="To date (included)" htmlFor="purge-to">
              <input id="purge-to" type="date" max={isoDay(new Date())} value={customTo} onChange={(e) => { setCustomTo(e.target.value); setTyped(''); }} disabled={!!busy} />
            </Field>
          </div>
        )}
        {range.error ? (
          <p className="muted tiny">{range.error}</p>
        ) : (
          <p className="muted tiny">Will delete history entries <b>{range.label}</b>.</p>
        )}
        {range.recent && !range.error && (
          <p className="muted tiny"><b>Heads up:</b> these are recent entries. Download the backup in step 1 first if you may need them.</p>
        )}
        {!online ? (
          <p className="muted tiny">You are offline. Connect to the internet to purge history.</p>
        ) : counts === 'none' ? null : counts === null ? (
          <Spinner label="Counting entries…" />
        ) : counts === 'err' ? (
          <div className="notice err">Could not count history entries. Check your internet and try again.</div>
        ) : (
          <p>
            Total history: <b>{counts.total}</b> entries. In the chosen range: <b>{counts.old}</b> entries.
          </p>
        )}

        <Field label={`Type ${WORD} to unlock`} htmlFor="purge-word">
          <input id="purge-word" value={typed} onChange={(e) => setTyped(e.target.value)} autoCapitalize="characters" autoComplete="off" disabled={!!busy} />
        </Field>
        <button className="btn danger" onClick={run} disabled={!ready}>
          <Icon name="trash" size={18} /> {busy === 'purge' ? `Deleting… ${progress}` : 'Delete history in this range'}
        </button>
        <p className="muted tiny">Up to about 5,000 entries are deleted per run to stay within the free daily limits. If more remain, run it again (tomorrow if a limit message appears).</p>
      </div>
    </>
  );
}

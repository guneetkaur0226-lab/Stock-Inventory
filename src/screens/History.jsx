import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Timestamp, collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../firebase.js';
import { useAuth } from '../auth.jsx';
import { useToast, Icon, Empty, Spinner } from '../components/ui.jsx';
import MoveRow from '../components/MoveRow.jsx';
import { fmtDate } from '../lib/format.js';
import { applyHistoryFilters, resolveDateRange } from '../lib/historyFilter.js';
import { useData } from '../store.jsx';
import LocationSelect from '../components/LocationSelect.jsx';
import { fetchAllMovements } from '../db.js';
import { downloadCsv } from '../lib/csv.js';
import { historyRows } from '../lib/exporter.js';

const TYPES = ['ALL', 'IN', 'OUT', 'MOVE', 'NEW', 'EDIT', 'DELETE'];

export default function History() {
  const { isOwner } = useAuth();
  const toast = useToast();
  const [count, setCount] = useState(300);
  const [moves, setMoves] = useState(null);
  const [q, setQ] = useState('');
  const [type, setType] = useState('ALL');
  const [busy, setBusy] = useState(false);
  const { items, suppliers } = useData();
  const [showFilters, setShowFilters] = useState(false);
  const [staff, setStaff] = useState('');
  const [supplier, setSupplier] = useState('');
  const [item, setItem] = useState('');
  const [location, setLocation] = useState('');
  const [dateKind, setDateKind] = useState('all'); // all | today | d7 | d30 | custom
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const dq = useDeferredValue(q);

  const range = useMemo(() => resolveDateRange(dateKind, dateFrom, dateTo), [dateKind, dateFrom, dateTo]);
  const rangeError = range.error || '';
  const fromMs = rangeError ? null : range.from?.getTime() ?? null;
  const toMs = rangeError ? null : range.to?.getTime() ?? null;

  useEffect(
    () =>
      onSnapshot(
        // the date range is applied by the server, so it also reaches entries older than the loaded ones
        query(
          collection(db, 'movements'),
          ...(fromMs !== null ? [where('at', '>=', Timestamp.fromMillis(fromMs))] : []),
          ...(toMs !== null ? [where('at', '<', Timestamp.fromMillis(toMs))] : []),
          orderBy('at', 'desc'),
          limit(count)
        ),
        { includeMetadataChanges: true },
        (snap) => setMoves(snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }), _pending: d.metadata.hasPendingWrites }))),
        (e) => {
          setMoves([]);
          toast(`Could not load history: ${e.message}`, 'err');
        }
      ),
    [count, toast, fromMs, toMs]
  );

  // choices for the filter drop-downs: everything in the loaded history plus current items / suppliers
  const staffOptions = useMemo(() => {
    const m = new Map();
    (moves || []).forEach((x) => x.by && !m.has(x.by) && m.set(x.by, x.byName || 'Unknown'));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [moves]);
  const supplierOptions = useMemo(() => {
    const m = new Map();
    suppliers.forEach((s) => m.set(s.name.toLowerCase(), s.name));
    (moves || []).forEach((x) => x.supplier && !m.has(x.supplier.toLowerCase()) && m.set(x.supplier.toLowerCase(), x.supplier));
    return [...m.values()].sort((a, b) => a.localeCompare(b));
  }, [moves, suppliers]);
  const itemOptions = useMemo(() => {
    const m = new Map();
    items.forEach((i) => m.set(i.id, i.name));
    (moves || []).forEach((x) => x.itemId && !m.has(x.itemId) && m.set(x.itemId, `${x.itemName} (deleted)`));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'en', { sensitivity: 'base', numeric: true }));
  }, [moves, items]);

  const list = useMemo(() => (moves ? applyHistoryFilters(moves, { type, q: dq, staff, supplier, item, location }) : []), [moves, dq, type, staff, supplier, item, location]);
  const activeFilters = [staff, supplier, item, location].filter(Boolean).length + (dateKind !== 'all' ? 1 : 0);
  const clearFilters = () => {
    setStaff('');
    setSupplier('');
    setItem('');
    setLocation('');
    setDateKind('all');
    setDateFrom('');
    setDateTo('');
    setType('ALL');
    setQ('');
  };

  async function exportCsv() {
    setBusy(true);
    try {
      const all = await fetchAllMovements();
      const today = new Date().toISOString().slice(0, 10);
      downloadCsv(`history-${today}.csv`, historyRows(all));
      toast(`Downloaded ${all.length} history entries`);
    } catch (e) {
      toast(`Download failed: ${e.message}. You need internet for this.`, 'err');
    }
    setBusy(false);
  }

  let lastDay = '';
  return (
    <>
      <div className="searchbar">
        <Icon name="search" />
        <input type="search" placeholder="Search history: item, person, note…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search history" />
        {q && (
          <button className="icon-btn" onClick={() => setQ('')} aria-label="Clear">
            <Icon name="close" />
          </button>
        )}
      </div>
      <div className="chips">
        {TYPES.map((t) => (
          <button key={t} className={`chip ${type === t ? 'on' : ''}`} onClick={() => setType(t)}>
            {t === 'ALL' ? 'Everything' : t === 'DELETE' ? 'Deleted' : t === 'MOVE' ? 'Moved' : t}
          </button>
        ))}
      </div>
      <button className="btn" onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}>
        <Icon name="filter" size={18} /> Filters{activeFilters ? ` (${activeFilters} on)` : ''}
      </button>
      {showFilters && (
        <div className="hist-filters card pad">
          <div className="grid2">
            <label className="field">
              <span>Staff member</span>
              <select value={staff} onChange={(e) => setStaff(e.target.value)}>
                <option value="">All staff</option>
                {staffOptions.map(([id, n]) => (
                  <option key={id} value={id}>{n}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Supplier</span>
              <select value={supplier} onChange={(e) => setSupplier(e.target.value)}>
                <option value="">All suppliers</option>
                {supplierOptions.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="field">
            <span>Item</span>
            <select value={item} onChange={(e) => setItem(e.target.value)}>
              <option value="">All items</option>
              {itemOptions.map(([id, n]) => (
                <option key={id} value={id}>{n}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Location</span>
            <LocationSelect value={location} onChange={setLocation} blank="All locations" />
          </label>
          <label className="field">
            <span>Date</span>
            <select value={dateKind} onChange={(e) => setDateKind(e.target.value)}>
              <option value="all">All dates</option>
              <option value="today">Today</option>
              <option value="d7">Last 7 days</option>
              <option value="d30">Last 30 days</option>
              <option value="custom">Custom range…</option>
            </select>
          </label>
          {dateKind === 'custom' && (
            <div className="grid2">
              <label className="field">
                <span>From</span>
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </label>
              <label className="field">
                <span>To (included)</span>
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </label>
            </div>
          )}
          {rangeError && <div className="err" role="alert">{rangeError}</div>}
          <button className="btn" onClick={clearFilters}>Clear all filters</button>
          <p className="hint">Action (IN / OUT / Moved) uses the buttons above. All filters work together.</p>
        </div>
      )}
      {isOwner && (
        <button className="btn" onClick={exportCsv} disabled={busy}>
          <Icon name="download" size={18} /> {busy ? 'Preparing…' : 'Download full history (CSV)'}
        </button>
      )}
      {moves === null ? (
        <Spinner label="Loading history…" />
      ) : list.length === 0 ? (
        <Empty icon="clock" title="No history found">History entries appear here after stock is added, taken out or edited.</Empty>
      ) : (
        <div className="moves">
          {list.map((m) => {
            const d = m.at?.toDate?.();
            const day = d ? fmtDate(d, true) : 'Today';
            const head = day !== lastDay ? <h3 className="day" key={'d' + m.id}>{day}</h3> : null;
            lastDay = day;
            return (
              <div key={m.id}>
                {head}
                <MoveRow m={m} />
              </div>
            );
          })}
          {moves.length >= count && (
            <button className="btn" onClick={() => setCount((c) => c + 300)}>
              Load older entries
            </button>
          )}
        </div>
      )}
      <p className="tiny muted center">History cannot be edited. Only the owner can remove entries older than 30 days (More → Purge old history).</p>
    </>
  );
}

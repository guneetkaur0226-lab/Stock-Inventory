import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase.js';
import { useAuth } from '../auth.jsx';
import { useToast, Icon, Empty, Spinner } from '../components/ui.jsx';
import MoveRow from '../components/MoveRow.jsx';
import { makeHaystack, matchesQuery } from '../lib/search.js';
import { fmtDate } from '../lib/format.js';
import { fetchAllMovements } from '../db.js';
import { downloadCsv } from '../lib/csv.js';
import { historyRows } from '../lib/exporter.js';

const TYPES = ['ALL', 'IN', 'OUT', 'NEW', 'EDIT', 'DELETE'];

export default function History() {
  const { isOwner } = useAuth();
  const toast = useToast();
  const [count, setCount] = useState(300);
  const [moves, setMoves] = useState(null);
  const [q, setQ] = useState('');
  const [type, setType] = useState('ALL');
  const [busy, setBusy] = useState(false);
  const dq = useDeferredValue(q);

  useEffect(
    () =>
      onSnapshot(
        query(collection(db, 'movements'), orderBy('at', 'desc'), limit(count)),
        { includeMetadataChanges: true },
        (snap) => setMoves(snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }), _pending: d.metadata.hasPendingWrites }))),
        (e) => {
          setMoves([]);
          toast(`Could not load history: ${e.message}`, 'err');
        }
      ),
    [count, toast]
  );

  const list = useMemo(() => {
    if (!moves) return [];
    return moves.filter((m) => {
      if (type !== 'ALL' && m.type !== type) return false;
      if (!dq.trim()) return true;
      return matchesQuery(makeHaystack(m.itemName, m.partNo, m.note, m.byName, m.supplier, m.type), dq);
    });
  }, [moves, dq, type]);

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
            {t === 'ALL' ? 'Everything' : t === 'DELETE' ? 'Deleted' : t}
          </button>
        ))}
      </div>
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
      <p className="tiny muted center">History is permanent: entries cannot be edited or deleted by anyone.</p>
    </>
  );
}

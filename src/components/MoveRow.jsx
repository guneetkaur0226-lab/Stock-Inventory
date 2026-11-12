import { fmtNum, fmtDate, fmtTime } from '../lib/format.js';
import { locationText } from '../lib/locations.js';

const LABEL = { IN: 'IN', OUT: 'OUT', NEW: 'NEW', EDIT: 'EDIT', DELETE: 'DELETED', MOVE: 'MOVED' };

const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);

export default function MoveRow({ m, showItem = true }) {
  const d = m.at?.toDate?.();
    // "old + qty = new": the supplier's own quantity when it was recorded, otherwise the item's total
  let sum = null;
  if (m.type === 'IN' || m.type === 'OUT') {
    if (isNumber(m.supplierBefore) && isNumber(m.supplierAfter)) sum = { label: 'Supplier Stock', before: m.supplierBefore, after: m.supplierAfter };
    else if (isNumber(m.stockAfter)) sum = { label: 'Total Stock', before: m.type === 'IN' ? m.stockAfter - m.qty : m.stockAfter + m.qty, after: m.stockAfter };
  }
  const r3 = (n) => Math.round(n * 1000) / 1000;
  return (
    <div className="move">
      <span className={`pill t-${m.type}`}>{LABEL[m.type] || m.type}</span>
      <div className="move-main">
        {showItem && (
          <div className="move-title">
            {m.itemName}
            {m.partNo ? <span className="muted"> · {m.partNo}</span> : null}
          </div>
        )}
        {m.supplier ? <div className="move-sup">{m.supplier}</div> : m.type === 'IN' || m.type === 'OUT' ? <div className="move-sup muted">No supplier</div> : null}
        {sum && (
          <div className="si-last">
            <div>
              Last change: <b>{m.type} {fmtNum(m.qty)} {m.unit}</b>
              {m.location ? <> at {locationText(m.location)}</> : null}
            </div>
            <div>
              Old {sum.label}: <b>{fmtNum(r3(sum.before))} {m.unit}</b> → now <b>{fmtNum(r3(sum.after))} {m.unit}</b>
            </div>
          </div>
        )}
        {m.type === 'NEW' && (
          <div className="move-qty">
            Opening stock <b>{fmtNum(m.qty)} {m.unit}</b>
          </div>
        )}
        {m.type === 'DELETE' && (
          <div className="move-qty">
            Deleted item that had <b>{fmtNum(m.qty)} {m.unit}</b>
          </div>
        )}
        {m.type === 'MOVE' && (
          <div className="move-qty">
            Moved <b>{fmtNum(m.qty)} {m.unit}</b>
          </div>
        )}
        {m.type === 'MOVE' ? (
          <div className="move-note muted">
            {locationText(m.location) || 'No location set'} → {locationText(m.toLocation)}
          </div>
        ) : m.location && !sum ? (
          <div className="move-note muted">{locationText(m.location)}</div>
        ) : null}
        {m.note ? <div className="move-note">{m.note}</div> : null}
        <div className="move-meta muted">
          {m.byName || 'Unknown'} - {d ? `${fmtDate(d)}, ${fmtTime(d)}` : 'just now'}
          {m._pending ? <span className="wait"> · ⏳ waiting to sync</span> : null}
        </div>
      </div>
    </div>
  );
}

import { fmtNum, fmtDate, fmtTime } from '../lib/format.js';

const LABEL = { IN: 'IN', OUT: 'OUT', NEW: 'NEW', EDIT: 'EDIT', DELETE: 'DELETED' };

export default function MoveRow({ m, showItem = true }) {
  const d = m.at?.toDate?.();
  let what = '';
  if (m.type === 'IN') what = `+${fmtNum(m.qty)} ${m.unit}`;
  else if (m.type === 'OUT') what = `−${fmtNum(m.qty)} ${m.unit}`;
  else if (m.type === 'NEW') what = `Opening ${fmtNum(m.qty)} ${m.unit}`;
  else if (m.type === 'DELETE') what = `Had ${fmtNum(m.qty)} ${m.unit}`;
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
        <div className="move-qty">
          {what && <b>{what}</b>}
          {m.type !== 'EDIT' && m.type !== 'DELETE' && (
            <span className="muted">
              {what ? ' → ' : ''}
              {fmtNum(m.stockAfter)} {m.unit} left
            </span>
          )}
        </div>
        {m.supplier ? <div className="move-note muted">Supplier: {m.supplier}</div> : null}
        {m.note ? <div className="move-note">{m.note}</div> : null}
        <div className="move-meta muted">
          {m.byName || 'Unknown'} · {d ? `${fmtDate(d)}, ${fmtTime(d)}` : 'just now'}
          {m._pending ? <span className="wait"> · ⏳ waiting to sync</span> : null}
        </div>
      </div>
    </div>
  );
}

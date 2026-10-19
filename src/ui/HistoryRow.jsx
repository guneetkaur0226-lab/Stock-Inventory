import { fmtDateTime, fmtNum } from '../lib/format';

const LABEL = { IN: 'IN', OUT: 'OUT', NEW: 'NEW', EDIT: 'EDIT', DELETE: 'DELETED' };

export default function HistoryRow({ h, showItem = true }) {
  const d = Number(h.delta) || 0;
  return (
    <div className={'hist ' + h.type.toLowerCase()}>
      <div className="hist-top">
        <span className={'badge t-' + h.type.toLowerCase()}>{LABEL[h.type] || h.type}</span>
        {showItem && <span className="hist-item">{h.itemName}{h.partNo ? <small> · {h.partNo}</small> : null}</span>}
        <span className="hist-qty">
          {h.type !== 'EDIT' ? <b>{d > 0 ? '+' : ''}{fmtNum(d)} {h.unit}</b> : null}
        </span>
      </div>
      <div className="hist-sub">
        {h.type !== 'EDIT' && <span>Stock after: <b>{fmtNum(h.stockAfter)}</b></span>}
        {h.supplier ? <span>Supplier: {h.supplier}</span> : null}
      </div>
      {h.details ? <div className="hist-note">{h.details}</div> : null}
      {h.note ? <div className="hist-note">“{h.note}”</div> : null}
      <div className="hist-by">{h.byName} · {fmtDateTime(h.at)}{h._pending ? ' · not synced yet' : ''}</div>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { Autocomplete, ConfirmButton, Field, Icon, Sheet, useToast } from '../ui/kit';
import HistoryRow from '../ui/HistoryRow';
import { ItemFields, validateFields } from './ItemForm';
import { useData } from '../state/DataContext';
import { fmtNum, parseNumber } from '../lib/format';
import { INT_UNITS, clean, holderList, round3, slug, stockState } from '../lib/keys';
import { deleteItem, editItem, recordMove } from '../lib/ops';
import { friendly } from '../lib/errors';

const NONE = '_none';

/* ------------------------------------------------------------- IN / OUT */
function MoveView({ item, profile, initialType, onDone, onBack }) {
  const { supplierNames } = useData();
  const toast = useToast();
  const { named, unassigned } = useMemo(() => holderList(item), [item]);
  const [type, setType] = useState(initialType);
  const [qtyStr, setQtyStr] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [fail, setFail] = useState('');

  // Where an OUT is taken from (supplier-wise stock)
  const sources = useMemo(() => {
    const s = named.filter((h) => h.qty > 0).map((h) => ({ key: h.key, name: h.name, qty: h.qty }));
    if (unassigned > 0) s.push({ key: NONE, name: 'No supplier', qty: unassigned });
    return s;
  }, [named, unassigned]);
  const [src, setSrc] = useState(sources[0]?.key || NONE);
  // Where an IN is added to
  const [supplier, setSupplier] = useState(named.length === 1 ? named[0].name : '');

  const source = sources.find((s) => s.key === src);
  const available = type === 'OUT' ? (sources.length ? source?.qty ?? 0 : item.qty) : Infinity;
  const q = qtyStr.trim() === '' ? NaN : parseNumber(qtyStr);

  let error = '';
  if (qtyStr.trim() !== '') {
    if (Number.isNaN(q)) error = 'Type a number, like 5.';
    else if (q <= 0) error = 'Quantity must be more than 0.';
    else if (INT_UNITS.includes(item.unit) && !Number.isInteger(q)) error = `Use whole numbers for ${item.unit}.`;
    else if (q > 1000000) error = 'That number is too big.';
    else if (type === 'OUT' && q > item.qty) error = `Only ${fmtNum(item.qty)} ${item.unit} in stock — you cannot take out ${fmtNum(q)}.`;
    else if (type === 'OUT' && q > available) error = `Only ${fmtNum(available)} ${item.unit} available${source ? ' with ' + source.name : ''}. Pick another supplier or reduce the quantity.`;
  }
  const valid = !Number.isNaN(q) && q > 0 && !error;
  const after = valid ? round3(item.qty + (type === 'IN' ? q : -q)) : item.qty;

  function bump(d) {
    const cur = Number.isNaN(q) ? 0 : q;
    let n = round3(cur + d);
    if (n < 0) n = 0;
    if (type === 'OUT' && Number.isFinite(available)) n = Math.min(n, available);
    setQtyStr(String(n));
  }

  const supErr = type === 'IN' && clean(supplier).length > 100 ? 'Supplier name is too long.' : '';

  async function save() {
    if (!valid || supErr || saving) return;
    setSaving(true); setFail('');
    let holderKey = null;
    let holderName = '';
    if (type === 'OUT') {
      if (src !== NONE && source) { holderKey = source.key; holderName = source.name; }
    } else if (clean(supplier)) {
      holderName = clean(supplier);
      holderKey = slug(holderName);
    }
    try {
      const r = await recordMove(profile, item, { type, qty: q, holderKey, holderName, note: clean(note) });
      toast(r.queued ? `${type} saved on this phone — will sync when online` : `${type} ${fmtNum(q)} ${item.unit} saved`);
      onDone();
    } catch (e) { setFail(friendly(e)); setSaving(false); }
  }

  return (
    <>
      <div className="sheet-body">
        <div className="move-item">
          <b>{item.name}</b>
          <span>In stock now: <b>{fmtNum(item.qty)} {item.unit}</b></span>
        </div>

        <div className="inout" role="tablist">
          <button role="tab" aria-selected={type === 'IN'} className={'in' + (type === 'IN' ? ' on' : '')} onClick={() => { setType('IN'); setFail(''); }}><Icon name="down" /> IN</button>
          <button role="tab" aria-selected={type === 'OUT'} className={'out' + (type === 'OUT' ? ' on' : '')} onClick={() => { setType('OUT'); setFail(''); }}><Icon name="up" /> OUT</button>
        </div>

        <Field label={`Quantity (${item.unit})`} error={error}>
          <div className="stepper">
            <button type="button" className="step" onClick={() => bump(-1)} aria-label="Minus one"><Icon name="minus" size={26} /></button>
            <input value={qtyStr} inputMode="decimal" placeholder="0" onChange={(e) => setQtyStr(e.target.value)} aria-label="Quantity" autoFocus />
            <button type="button" className="step" onClick={() => bump(1)} aria-label="Plus one"><Icon name="plus" size={26} /></button>
          </div>
        </Field>
        <div className="quick">
          {[5, 10, 25, 50].map((n) => <button key={n} type="button" className="chip" onClick={() => bump(n)}>+{n}</button>)}
          {type === 'OUT' && Number.isFinite(available) && available > 0 && <button type="button" className="chip" onClick={() => setQtyStr(String(available))}>All ({fmtNum(available)})</button>}
        </div>

        {type === 'OUT' && sources.length > 1 && (
          <Field label="Take from (supplier)">
            <div className="chips wrap">
              {sources.map((s) => (
                <button key={s.key} type="button" className={'chip' + (src === s.key ? ' on' : '')} onClick={() => setSrc(s.key)}>
                  {s.name} <b>{fmtNum(s.qty)}</b>
                </button>
              ))}
            </div>
          </Field>
        )}
        {type === 'IN' && (
          <>
            {named.length > 1 && (
              <div className="chips wrap tight">
                {named.map((h) => <button key={h.key} type="button" className={'chip' + (clean(supplier).toLowerCase() === h.name.toLowerCase() ? ' on' : '')} onClick={() => setSupplier(h.name)}>{h.name}</button>)}
              </div>
            )}
            <Autocomplete label="Supplier (optional)" value={supplier} onChange={setSupplier} options={supplierNames} placeholder="who it came from / is held by" error={supErr} maxLength={100} />
          </>
        )}

        <Field label={type === 'IN' ? 'Note — supplier / bill no. (optional)' : 'Note — customer (optional)'}>
          <input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder={type === 'IN' ? 'e.g. Bill 1042' : 'e.g. Sharma Electricals'} />
        </Field>

        <div className={'after ' + (valid ? type.toLowerCase() : '')}>
          Stock after: <b>{fmtNum(after)} {item.unit}</b>
        </div>
        {fail && <div className="banner error" role="alert">{fail}</div>}
      </div>
      <div className="sheet-foot split">
        <button className="btn ghost" onClick={onBack} disabled={saving}>Back</button>
        <button className={'btn big ' + (type === 'IN' ? 'in' : 'out')} onClick={save} disabled={!valid || !!supErr || saving}>
          {saving ? 'Saving…' : valid ? `Save ${type} ${type === 'IN' ? '+' : '−'}${fmtNum(q)}` : `Save ${type}`}
        </button>
      </div>
    </>
  );
}

/* ----------------------------------------------------------------- edit */
function EditView({ item, profile, onDone, onBack }) {
  const { items, supplierNames } = useData();
  const toast = useToast();
  const [f, setF] = useState({ name: item.name, partNo: item.partNo || '', brand: item.brand || '', model: item.model || '', unit: item.unit, minStock: String(item.minStock || '') });
  const [saving, setSaving] = useState(false);
  const [fail, setFail] = useState('');
  const [show, setShow] = useState(false);
  const errors = useMemo(() => validateFields(f, { mode: 'edit', items, selfId: item.id }), [f, items, item.id]);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  async function save() {
    setShow(true);
    if (Object.keys(errors).length) return;
    setSaving(true); setFail('');
    try {
      const r = await editItem(profile, item, { ...f, minStock: f.minStock.trim() === '' ? 0 : parseNumber(f.minStock) });
      toast(r.unchanged ? 'Nothing was changed' : r.queued ? 'Saved on this phone — will sync when online' : 'Item updated');
      onDone();
    } catch (e) { setFail(friendly(e)); setSaving(false); }
  }
  return (
    <>
      <div className="sheet-body">
        <ItemFields f={f} set={set} errors={show ? errors : {}} mode="edit" supplierNames={supplierNames} />
        <p className="hint">To change the quantity, use IN or OUT so it is recorded in the history.</p>
        {fail && <div className="banner error" role="alert">{fail}</div>}
      </div>
      <div className="sheet-foot split">
        <button className="btn ghost" onClick={onBack} disabled={saving}>Cancel</button>
        <button className="btn primary big" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
      </div>
    </>
  );
}

/* ----------------------------------------------------------------- main */
export default function ItemSheet({ item, profile, onClose }) {
  const toast = useToast();
  const [mode, setMode] = useState('view'); // view | in | out | edit
  const [hist, setHist] = useState([]);
  const [delFail, setDelFail] = useState('');
  const isOwner = profile.role === 'owner';
  const st = stockState(item);
  const { named, unassigned } = useMemo(() => holderList(item), [item]);

  useEffect(() => {
    const qy = query(collection(db, 'history'), where('itemId', '==', item.id));
    return onSnapshot(qy, { includeMetadataChanges: true }, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }), _pending: d.metadata.hasPendingWrites }));
      rows.sort((a, b) => (b.at?.toMillis?.() || 0) - (a.at?.toMillis?.() || 0));
      setHist(rows);
    }, () => {});
  }, [item.id]);

  async function remove() {
    setDelFail('');
    try {
      await deleteItem(profile, item);
      toast(`Deleted “${item.name}”`);
      onClose();
    } catch (e) { setDelFail(friendly(e)); }
  }

  const title = mode === 'edit' ? 'Edit item' : mode === 'view' ? 'Item' : mode === 'in' ? 'Stock IN' : 'Stock OUT';
  return (
    <Sheet title={title} onClose={onClose} bare>
      {mode === 'view' && (
        <>
          <div className="sheet-body">
            <div className="detail-head">
              <div>
                <h3>{item.name}</h3>
                <div className="item-meta">{[item.partNo && `Part no: ${item.partNo}`, item.brand, item.model].filter(Boolean).join(' · ') || 'No part no. / brand / model'}</div>
              </div>
              <div className={'bigqty ' + st}><b>{fmtNum(item.qty)}</b><span>{item.unit}</span></div>
            </div>
            <div className="item-tags">
              {st === 'out' && <span className="badge out">Out of stock</span>}
              {st === 'low' && <span className="badge low"><Icon name="warn" size={13} /> Low stock — alert at {fmtNum(item.minStock)}</span>}
              {item.minStock > 0 && st === 'ok' && <span className="badge ok">Alert at {fmtNum(item.minStock)}</span>}
              {item._pending && <span className="badge pend"><Icon name="clock" size={13} /> Not synced yet</span>}
            </div>

            <div className="actions2">
              <button className="btn in big" onClick={() => setMode('in')}><Icon name="down" /> Stock IN</button>
              <button className="btn out big" onClick={() => setMode('out')} disabled={item.qty <= 0}><Icon name="up" /> Stock OUT</button>
            </div>

            {(named.length > 0) && (
              <div className="panel">
                <div className="panel-title">Stock by supplier</div>
                {named.map((h) => (
                  <div key={h.key} className={'kv' + (h.qty === 0 ? ' dim' : '')}><span>{h.name}</span><b>{fmtNum(h.qty)} {item.unit}</b></div>
                ))}
                {unassigned > 0 && <div className="kv"><span>No supplier</span><b>{fmtNum(unassigned)} {item.unit}</b></div>}
              </div>
            )}

            <div className="panel-title pad">Recent history</div>
            {hist.length === 0 && <p className="muted small">No history yet.</p>}
            {hist.slice(0, 8).map((h) => <HistoryRow key={h.id} h={h} showItem={false} />)}
            {hist.length > 8 && <p className="muted small">Older entries are in the History tab.</p>}

            <div className="actions-sec">
              <button className="btn ghost" onClick={() => setMode('edit')}><Icon name="edit" /> Edit details</button>
              {isOwner && <ConfirmButton label="Delete item" confirmLabel="Tap again to delete for good" onConfirm={remove} className="btn danger-ghost" />}
            </div>
            {delFail && <div className="banner error" role="alert">{delFail}</div>}
          </div>
        </>
      )}
      {(mode === 'in' || mode === 'out') && (
        <MoveView item={item} profile={profile} initialType={mode.toUpperCase()} onDone={onClose} onBack={() => setMode('view')} />
      )}
      {mode === 'edit' && <EditView item={item} profile={profile} onDone={onClose} onBack={() => setMode('view')} />}
    </Sheet>
  );
}

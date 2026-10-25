import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where, limit } from 'firebase/firestore';
import { db } from '../firebase.js';
import { useAuth } from '../auth.jsx';
import { useData } from '../store.jsx';
import { searchItems } from '../lib/search.js';
import { fmtNum } from '../lib/format.js';
import { parseNumber } from '../lib/text.js';
import { locationText } from '../lib/locations.js';
import { rowsForSupplier, unlocated } from '../lib/stockLoc.js';
import LocationSelect from '../components/LocationSelect.jsx';
import { addItem, buckets, deleteItem, editItem, recordStock, validateMove } from '../db.js';
import { Empty, Field, Icon, Segmented, Sheet, Spinner, SuggestInput, useConfirm, useToast } from '../components/ui.jsx';
import MoveRow from '../components/MoveRow.jsx';
import ItemForm from './ItemForm.jsx';

export const isLow = (i) => i.qty === 0 || (i.minQty > 0 && i.qty <= i.minQty);

function useSupplierNames() {
  const { suppliers, items } = useData();
  return useMemo(() => {
    const s = new Map();
    suppliers.forEach((x) => s.set(x.name.toLowerCase(), x.name));
    items.forEach((i) => Object.keys(i.bySupplier || {}).forEach((n) => !s.has(n.toLowerCase()) && s.set(n.toLowerCase(), n)));
    return [...s.values()].sort((a, b) => a.localeCompare(b));
  }, [suppliers, items]);
}

function userOf(auth) {
  return { uid: auth.fbUser.uid, name: auth.name, email: auth.fbUser.email };
}

export default function Stock() {
  const { items, itemsReady, fromCache, online } = useData();
  const [q, setQ] = useState('');
  const [low, setLow] = useState(false);
  const [shown, setShown] = useState(60);
  const [selId, setSelId] = useState(null);
  const [adding, setAdding] = useState(false);
  const dq = useDeferredValue(q);

  const lowCount = useMemo(() => items.filter(isLow).length, [items]);
  const list = useMemo(() => searchItems(low ? items.filter(isLow) : items, dq), [items, low, dq]);
  useEffect(() => setShown(60), [dq, low]);

  const sel = items.find((i) => i.id === selId);

  return (
    <>
      <div className="searchbar">
        <Icon name="search" />
        <input
          type="search"
          inputMode="search"
          placeholder="Search name, part no., brand, model…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search stock"
          enterKeyHint="search"
        />
        {q && (
          <button className="icon-btn" onClick={() => setQ('')} aria-label="Clear search">
            <Icon name="close" />
          </button>
        )}
      </div>
      <div className="chips">
        <button className={`chip ${!low ? 'on' : ''}`} onClick={() => setLow(false)}>
          All items ({items.length})
        </button>
        <button className={`chip warn ${low ? 'on' : ''}`} onClick={() => setLow(true)}>
          <Icon name="alert" size={16} /> Low / out ({lowCount})
        </button>
      </div>

      {!itemsReady ? (
        <Spinner label={online ? 'Loading stock…' : 'Offline — loading saved stock…'} />
      ) : list.length === 0 ? (
        items.length === 0 ? (
          <Empty title="No items yet">
            Tap the + button to add your first item. {fromCache && !online ? '(You are offline.)' : ''}
          </Empty>
        ) : (
          <Empty icon="search" title="Nothing found">
            Try fewer words. You can type any mix of name, part number, brand or model.
          </Empty>
        )
      ) : (
        <ul className="list">
          {list.slice(0, shown).map((i) => (
            <li key={i.id}>
              <button className={`item ${isLow(i) ? 'low' : ''}`} onClick={() => setSelId(i.id)}>
                <div className="item-main">
                  <div className="item-name">{i.name}</div>
                  <div className="item-sub">{[i.partNo, i.brand, i.model].filter(Boolean).join(' · ') || '—'}</div>
                  {isLow(i) && <span className="tag low">{i.qty === 0 ? 'Out of stock' : 'Low stock'}</span>}
                  {i._pending && <span className="tag sync">⏳ syncing</span>}
                </div>
                <div className="item-qty">
                  <b>{fmtNum(i.qty)}</b>
                  <span>{i.unit}</span>
                </div>
              </button>
            </li>
          ))}
          {list.length > shown && (
            <li>
              <button className="btn" onClick={() => setShown((s) => s + 100)}>
                Show more ({list.length - shown} more)
              </button>
            </li>
          )}
        </ul>
      )}

      <button className="fab" onClick={() => setAdding(true)} aria-label="Add new item">
        <Icon name="plus" size={28} />
      </button>

      {sel && <ItemSheet item={sel} onClose={() => setSelId(null)} />}
      {selId && !sel && itemsReady && <ItemGone onClose={() => setSelId(null)} />}
      {adding && <AddSheet onClose={() => setAdding(false)} />}
    </>
  );
}

function ItemGone({ onClose }) {
  useEffect(() => onClose(), [onClose]);
  return null;
}

function AddSheet({ onClose }) {
  const auth = useAuth();
  const { items } = useData();
  const supplierNames = useSupplierNames();
  const toast = useToast();
  return (
    <Sheet title="Add new item" onClose={onClose} tall>
      <ItemForm
        mode="add"
        items={items}
        supplierNames={supplierNames}
        onSubmit={(d) => {
          addItem({ data: d, supplier: d.supplier, location: d.location, note: d.note, user: userOf(auth) }).catch((e) =>
            toast(`"${d.name}" could not be saved: ${e.code === 'permission-denied' ? 'not allowed by the server' : e.message}`, 'err')
          );
          toast(`Added "${d.name}"`);
          onClose();
        }}
      />
    </Sheet>
  );
}

function ItemSheet({ item, onClose }) {
  const auth = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const { items, locStock } = useData();
  const itemRows = useMemo(() => locStock.filter((r) => r.itemId === item.id), [locStock, item.id]);
  const supplierNames = useSupplierNames();
  const [view, setView] = useState('move'); // move | edit
  const [location, setLocation] = useState('');
  const [type, setType] = useState('OUT');
  const [qtyText, setQtyText] = useState('1');
  const [supplier, setSupplier] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [moves, setMoves] = useState(null);
  const decimal = !['pcs', 'set', 'box'].includes(item.unit);
  const { by, unassigned } = buckets(item);

  useEffect(() => {
    const q = query(collection(db, 'movements'), where('itemId', '==', item.id), limit(300));
    return onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snap) =>
        setMoves(
          snap.docs
            .map((d) => ({ id: d.id, ..._data(d), _pending: d.metadata.hasPendingWrites }))
            .sort((a, b) => (b.at?.toMillis?.() || 0) - (a.at?.toMillis?.() || 0))
        ),
      () => setMoves([])
    );
  }, [item.id]);

  useEffect(() => {
    setSupplier('');
    setLocation('');
  }, [type]);

  const qty = parseNumber(qtyText);
  const bump = (d) => {
    const cur = Number.isFinite(qty) ? qty : 0;
    setQtyText(String(Math.max(0, Math.round((cur + d) * 1000) / 1000)));
    setError('');
  };

  function save() {
    const n = Number.isFinite(qty) ? qty : NaN;
    const err = validateMove(item, type, n, supplier, location, itemRows);
    if (err) return setError(err);
    try {
      recordStock({ item, type, qty: n, supplier, location, itemRows, note, user: userOf(auth) }).catch((e) =>
        toast(
          e.code === 'permission-denied'
            ? `NOT SAVED: ${type} ${n} ${item.unit} of "${item.name}". Stock changed on another phone meanwhile — open the item and try again.`
            : `NOT SAVED: ${e.message}`,
          'err'
        )
      );
    } catch (e) {
      return setError(e.message);
    }
    const after = Math.round((type === 'IN' ? item.qty + n : item.qty - n) * 1000) / 1000;
    toast(`${type} ${fmtNum(n)} ${item.unit} saved — now ${fmtNum(after)}`);
    onClose();
  }

  async function remove() {
    const ok = await confirm({
      title: 'Delete this item?',
      message: `"${item.name}" will be removed from the stock list. Its history stays in the history log.`,
      okText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    deleteItem({ item, itemRows, user: userOf(auth) }).catch((e) => toast(`Not deleted: ${e.message}`, 'err'));
    toast('Item deleted');
    onClose();
  }

  if (view === 'edit') {
    return (
      <Sheet title="Edit item" onClose={() => setView('move')} tall>
        <ItemForm
          mode="edit"
          item={item}
          items={items}
          supplierNames={supplierNames}
          onSubmit={(d) => {
            const p = editItem({ item, data: d, user: userOf(auth) });
            if (!p) toast('No changes to save');
            else {
              p.catch((e) => toast(`Not saved: ${e.message}`, 'err'));
              toast('Item updated');
            }
            onClose();
          }}
        />
      </Sheet>
    );
  }

  // Where OUT can take stock from: each supplier + location that still has stock.
  const outOptions = [{ s: '', l: '', label: 'Any / not sure' }];
  Object.entries(by)
    .filter(([, v]) => v > 0)
    .forEach(([k]) => {
      const mine = rowsForSupplier(itemRows, k).filter((r) => r.qty > 0);
      mine.forEach((r) => outOptions.push({ s: k, l: r.location, label: `${k} · ${locationText(r.location)} (${fmtNum(r.qty)})` }));
      const rest = unlocated(item, itemRows, k);
      if (rest > 0) outOptions.push({ s: k, l: '', label: mine.length ? `${k} · No location set (${fmtNum(rest)})` : `${k} (${fmtNum(rest)})` });
    });
  const outIdx = Math.max(0, outOptions.findIndex((o) => o.s === supplier && o.l === location));

  return (
    <Sheet title={item.name} onClose={onClose} tall>
      <div className="item-head">
        <div className="muted">{[item.partNo && `Part ${item.partNo}`, item.brand, item.model].filter(Boolean).join(' · ') || 'No part no. / brand / model'}</div>
        <div className={`bigqty ${item.qty === 0 ? 'out' : item.minQty > 0 && item.qty <= item.minQty ? 'lowq' : ''}`}>
          {fmtNum(item.qty)} <span>{item.unit} in stock</span>
        </div>
        {item.minQty > 0 && <div className="muted tiny">Alert at {fmtNum(item.minQty)} {item.unit} or less</div>}
        {(Object.keys(by).length > 0 || unassigned > 0) && (
          <div className="sup-chips" aria-label="Stock by supplier">
            {Object.entries(by)
              .filter(([, v]) => v > 0)
              .sort((a, b) => b[1] - a[1])
              .map(([k, v]) => (
                <span key={k} className="chip static">
                  {k}: <b>{fmtNum(v)}</b>
                </span>
              ))}
            {unassigned > 0 && Object.keys(by).length > 0 && (
              <span className="chip static">Other: <b>{fmtNum(unassigned)}</b></span>
            )}
          </div>
        )}
      </div>

      <Segmented
        value={type}
        onChange={(v) => {
          setType(v);
          setError('');
        }}
        options={[
          { value: 'IN', label: '＋ Stock IN', cls: 'in' },
          { value: 'OUT', label: '－ Stock OUT', cls: 'out' },
        ]}
      />

      <Field label="Quantity" error={error}>
        <div className="stepper">
          <button type="button" className="step" onClick={() => bump(-1)} aria-label="Decrease">
            <Icon name="minus" size={28} />
          </button>
          <input
            inputMode={decimal ? 'decimal' : 'numeric'}
            value={qtyText}
            onChange={(e) => {
              setQtyText(e.target.value);
              setError('');
            }}
            onFocus={(e) => e.target.select()}
            aria-label="Quantity"
          />
          <button type="button" className="step" onClick={() => bump(1)} aria-label="Increase">
            <Icon name="plus" size={28} />
          </button>
        </div>
        <div className="quick">
          {[5, 10, 25, 50].map((n) => (
            <button key={n} type="button" className="chip" onClick={() => bump(n)}>
              +{n}
            </button>
          ))}
          {type === 'OUT' && (
            <button type="button" className="chip" onClick={() => setQtyText(String(item.qty))}>
              All ({fmtNum(item.qty)})
            </button>
          )}
        </div>
      </Field>

      {type === 'IN' ? (
        <>
          <Field label="From supplier (optional)" htmlFor="m-sup">
            <SuggestInput
              id="m-sup"
              value={supplier}
              onChange={(v) => {
                setSupplier(v);
                if (!v.trim()) setLocation('');
              }}
              options={supplierNames}
              maxLength={80}
              placeholder="Type or pick a supplier"
            />
          </Field>
          {supplier.trim() && (
            <Field label="Store at location (optional)" htmlFor="m-loc">
              <LocationSelect id="m-loc" value={location} onChange={(v) => { setLocation(v); setError(''); }} blank="No location set" />
            </Field>
          )}
        </>
      ) : (
        outOptions.length > 1 && (
          <Field label="Taken from (optional)" htmlFor="m-from">
            <select
              id="m-from"
              value={outIdx}
              onChange={(e) => {
                const o = outOptions[Number(e.target.value)];
                setSupplier(o.s);
                setLocation(o.l);
                setError('');
              }}
            >
              {outOptions.map((o, i) => (
                <option key={i} value={i}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
        )
      )}

      <Field label={type === 'IN' ? 'Note (supplier bill, remarks…)' : 'Note (customer name, remarks…)'} htmlFor="m-note">
        <input id="m-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Optional" />
      </Field>

      <button className={`btn big ${type === 'IN' ? 'in' : 'out'}`} onClick={save} disabled={type === 'OUT' && item.qty === 0}>
        {type === 'OUT' && item.qty === 0 ? 'Out of stock' : `Save ${type}`}
      </button>

      {auth.isOwner && (
        <div className="row gap owner-actions">
          <button className="btn" onClick={() => setView('edit')}>
            <Icon name="edit" size={18} /> Edit details
          </button>
          <button className="btn danger-o" onClick={remove}>
            <Icon name="trash" size={18} /> Delete
          </button>
        </div>
      )}

      <h3 className="sec">History of this item</h3>
      {moves === null ? (
        <Spinner />
      ) : moves.length === 0 ? (
        <p className="muted">No history yet.</p>
      ) : (
        <div className="moves">
          {moves.slice(0, 10).map((m) => (
            <MoveRow key={m.id} m={m} showItem={false} />
          ))}
          {moves.length > 10 && <p className="muted tiny">Showing the latest 10 of {moves.length}. Search the History tab for more.</p>}
        </div>
      )}
    </Sheet>
  );
}

const _data = (d) => d.data({ serverTimestamps: 'estimate' });

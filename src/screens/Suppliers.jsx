import { useDeferredValue, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth.jsx';
import { useData } from '../store.jsx';
import { deleteSupplier, moveStock, recordStock, saveSupplier, validateMove } from '../db.js';
import { fmtNum } from '../lib/format.js';
import { clean, parseNumber, slug } from '../lib/text.js';
import { makeHaystack, matchesQuery, searchItems } from '../lib/search.js';
import { locationText } from '../lib/locations.js';
import { groupByItem, placeText, rowsForSupplier, supplierItemView, supplierKey } from '../lib/stockLoc.js';
import LocationSelect from '../components/LocationSelect.jsx';
import { Empty, Field, Icon, Sheet, Spinner, SuggestInput, useConfirm, useToast } from '../components/ui.jsx';

const userOf = (auth) => ({ uid: auth.fbUser.uid, name: auth.name, email: auth.fbUser.email });
const partLine = (i) => [i.partNo, i.brand, i.model].filter(Boolean).join(' · ') || 'No part no. / brand / model';

export default function Suppliers() {
  const auth = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const { prices, suppliers, items, itemsReady, locStock, online } = useData();
  const [deleting, setDeleting] = useState('');
  const [q, setQ] = useState('');
  const dq = useDeferredValue(q);
  const [open, setOpen] = useState({});
  const [supForm, setSupForm] = useState(null); // {} = new supplier, {name,...} = edit
  const [shown, setShown] = useState(30);

  const rowsByItem = useMemo(() => groupByItem(locStock), [locStock]);

  const supplierNames = useMemo(() => {
    const m = new Map();
    suppliers.forEach((s) => m.set(slug(s.name), s.name));
    prices.forEach((p) => !m.has(slug(p.supplier)) && m.set(slug(p.supplier), p.supplier));
    items.forEach((i) => Object.keys(i.bySupplier || {}).forEach((k) => !m.has(slug(k)) && m.set(slug(k), k)));
    locStock.forEach((r) => !m.has(slug(r.supplier)) && m.set(slug(r.supplier), r.supplier));
    return [...m.values()].sort((a, b) => a.localeCompare(b));
  }, [suppliers, prices, items, locStock]);

  const searchOptions = useMemo(() => [...supplierNames, ...new Set(items.map((i) => i.name))], [supplierNames, items]);

  // supplier -> the items it is linked to (it holds stock of them, or has a location chosen for them)
  const cards = useMemo(() => {
    const dirOf = new Map(suppliers.map((s) => [slug(s.name), s]));
    const itemById = new Map(items.map((i) => [i.id, i]));
    const linked = new Map(); // slug(supplier) -> Set(itemId)
    const link = (sup, id) => {
      const k = slug(sup);
      if (!linked.has(k)) linked.set(k, new Set());
      linked.get(k).add(id);
    };
    items.forEach((i) => Object.keys(i.bySupplier || {}).forEach((k) => link(k, i.id)));
    locStock.forEach((r) => itemById.has(r.itemId) && link(r.supplier, r.itemId));

    return supplierNames
      .map((name) => {
        const dir = dirOf.get(slug(name));
        const all = [...(linked.get(slug(name)) || [])]
          .map((id) => itemById.get(id))
          .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base', numeric: true }))
          .map((item) => ({ item, view: supplierItemView(item, rowsByItem.get(item.id), name) }));
        const supHay = makeHaystack(name, dir?.note, dir?.address);
        const supMatch = !dq.trim() || matchesQuery(supHay, dq);
        // a search can name the supplier, an item, or both ("arjun silencer")
        const list = supMatch ? all : all.filter(({ item }) => matchesQuery(makeHaystack(name, item.name, item.partNo, item.brand, item.model), dq));
        return { name, dir, all, list, visible: supMatch || list.length > 0, byItemOnly: !supMatch && list.length > 0 };
      })
      .filter((s) => s.visible);
  }, [supplierNames, suppliers, items, locStock, rowsByItem, dq]);

  async function removeSupplier(s) {
    if (!auth.isOwner) return;
    if (!online) {
      toast('You are offline. Connect to the internet to delete a supplier.', 'err');
      return;
    }
    const nLoc = locStock.filter((r) => slug(r.supplier) === slug(s.name)).length;
    const ok = await confirm({
      title: `Delete supplier “${s.name}”?`,
      message:
        `${s.all.length} stock item${s.all.length === 1 ? '' : 's'} are linked to this supplier. Those items and their total quantities are KEPT; only the supplier name${nLoc ? ' and its location quantities' : ''} are removed from them (the quantity then shows as “Other”). ` +
        'Any saved prices for this supplier are deleted. Old history entries stay. This cannot be undone.',
      okText: 'Delete supplier',
      danger: true,
    });
    if (!ok) return;
    setDeleting(s.name);
    try {
      const r = await deleteSupplier({
        name: s.name,
        docIds: suppliers.filter((x) => slug(x.name) === slug(s.name)).map((x) => x.id),
        items,
        prices,
        locRows: locStock,
        user: userOf(auth),
      });
      toast(`Supplier deleted. ${r.itemsUpdated} stock item${r.itemsUpdated === 1 ? '' : 's'} kept.`);
    } catch (e) {
      toast(`Could not delete supplier: ${e.message}. Nothing was lost; you can try again.`, 'err');
    }
    setDeleting('');
  }

  return (
    <>
      <div className="searchbar">
        <Icon name="search" />
        <SuggestInput
          id="sup-search"
          type="search"
          value={q}
          onChange={(v) => {
            setQ(v);
            setShown(30);
          }}
          options={searchOptions}
          placeholder="Search supplier or item name…"
          aria-label="Search suppliers and items"
        />
        {q && (
          <button className="icon-btn" onClick={() => setQ('')} aria-label="Clear">
            <Icon name="close" />
          </button>
        )}
      </div>

      {!itemsReady ? (
        <Spinner label="Loading suppliers…" />
      ) : cards.length === 0 ? (
        <Empty icon="tag" title="No suppliers found">
          {dq.trim() ? 'Try fewer words. You can search by supplier name or item name.' : 'Tap the + button to add a supplier.'}
        </Empty>
      ) : (
        <ul className="list">
          {cards.slice(0, shown).map((s) => {
            const isOpen = open[s.name] ?? (dq.trim() !== '' && cards.length <= 4);
            const sub = [s.dir?.address, s.dir?.note].filter(Boolean).join(' · ') || 'No address or description';
            return (
              <li key={s.name} className="card">
                <button className="card-head" onClick={() => setOpen((o) => ({ ...o, [s.name]: !isOpen }))} aria-expanded={isOpen}>
                  <div className="sup-head-main">
                    <div className="item-name">{s.name}</div>
                    <div className="item-sub">{sub}</div>
                  </div>
                  <span className="count">
                    {s.byItemOnly ? `${s.list.length} of ${s.all.length}` : s.all.length} item{s.all.length === 1 ? '' : 's'}
                  </span>
                </button>
                {isOpen && (
                  <div className="card-body">
                    {s.list.length === 0 && <p className="muted">No items linked to this supplier yet. Use “Edit supplier” to choose items and locations.</p>}
                    {s.list.slice(0, 60).map(({ item, view }) => (
                      <SupplierItem key={item.id} item={item} view={view} supplier={s.name} itemRows={rowsByItem.get(item.id) || []} />
                    ))}
                    {s.list.length > 60 && <div className="muted tiny">…and {s.list.length - 60} more items. Search to narrow the list.</div>}
                    {auth.isOwner && (
                      <>
                        <button className="btn" onClick={() => setSupForm({ ...(s.dir || {}), id: s.dir?.id || slug(s.name), name: s.name })}>
                          <Icon name="edit" size={18} /> Edit supplier
                        </button>
                        <button className="btn danger-o" onClick={() => removeSupplier(s)} disabled={!!deleting}>
                          <Icon name="trash" size={18} /> {deleting === s.name ? 'Deleting…' : 'Delete supplier'}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
          {cards.length > shown && (
            <li>
              <button className="btn" onClick={() => setShown((n) => n + 30)}>
                Show more
              </button>
            </li>
          )}
        </ul>
      )}

      {auth.isOwner && (
        <button className="fab" onClick={() => setSupForm({})} aria-label="Add supplier">
          <Icon name="plus" size={28} />
        </button>
      )}

      {supForm && <SupplierForm start={supForm} supplierNames={supplierNames} rowsByItem={rowsByItem} onClose={() => setSupForm(null)} />}
    </>
  );
}

// ------------------------------------------------------------ one item of a supplier
function SupplierItem({ item, view, supplier, itemRows }) {
  return (
    <div className="si">
      <div className="si-head">
        <div className="si-name">{item.name}</div>
        <div className="si-sub">{partLine(item)}</div>
        <div className="si-totals">
          <span className="chip static">
            Supplier Stock: <b>{fmtNum(view.supplierStock)} {item.unit}</b>
          </span>
          <span className="chip static">
            Total Item Stock: <b>{fmtNum(view.totalStock)} {item.unit}</b>
          </span>
        </div>
      </div>
      {view.lines.length === 0 && <div className="muted tiny">No location chosen yet. Use “Edit supplier” to add one.</div>}
      {view.lines.map((line) => (
        <LocationLine key={line.id} item={item} line={line} supplier={view.key || supplier} itemRows={itemRows} />
      ))}
    </div>
  );
}

// ------------------------------------------- one Supplier + Item + Location row, with IN / OUT
function LocationLine({ item, line, supplier, itemRows }) {
  const auth = useAuth();
  const toast = useToast();
  const [qtyText, setQtyText] = useState('1');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [moving, setMoving] = useState(false);
  const busyTimer = useRef(null);
  const decimal = !['pcs', 'set', 'box'].includes(item.unit);
  const hasLoc = !!line.location;

  const qty = parseNumber(qtyText);
  const bump = (d) => {
    const cur = Number.isFinite(qty) ? qty : 0;
    setQtyText(String(Math.max(0, Math.round((cur + d) * 1000) / 1000)));
    setErr('');
  };

  function act(type) {
    if (busy) return;
    const n = Number.isFinite(qty) ? qty : NaN;
    const bad = validateMove(item, type, n, supplier, line.location, itemRows);
    if (bad) return setErr(bad);
    try {
      recordStock({ item, type, qty: n, supplier, location: line.location, itemRows, user: userOf(auth) }).catch((e) =>
        toast(
          e.code === 'permission-denied'
            ? `NOT SAVED: ${type} ${n} ${item.unit} of "${item.name}". Stock changed on another phone meanwhile — look at the new quantity and try again.`
            : `NOT SAVED: ${e.message}`,
          'err'
        )
      );
    } catch (e) {
      return setErr(e.message);
    }
    setErr('');
    setBusy(true); // the new quantity arrives a moment later; stops an accidental double tap
    clearTimeout(busyTimer.current);
    busyTimer.current = setTimeout(() => setBusy(false), 800);
    const after = Math.round((type === 'IN' ? line.qty + n : line.qty - n) * 1000) / 1000;
    toast(`${type} ${fmtNum(n)} ${item.unit} saved — ${placeText(line.location)} now ${fmtNum(after)}`);
  }

  // Staff may move stock between locations; giving location-less stock its first location is the owner's job.
  const canMove = line.qty > 0 && (hasLoc || auth.isOwner);

  return (
    <div className="ll">
      <div className="ll-top">
        <div className={`ll-loc ${hasLoc ? '' : 'none'}`}>{placeText(line.location)}</div>
        <div className="ll-qty">
          <b>{fmtNum(line.qty)}</b> <span>{item.unit}</span>
        </div>
      </div>
      <div className="ll-ctl">
        <div className="ll-step">
          <button type="button" className="step" onClick={() => bump(-1)} aria-label="Decrease quantity">
            <Icon name="minus" size={20} />
          </button>
          <input
            inputMode={decimal ? 'decimal' : 'numeric'}
            value={qtyText}
            onChange={(e) => {
              setQtyText(e.target.value);
              setErr('');
            }}
            onFocus={(e) => e.target.select()}
            aria-label={`Quantity for ${placeText(line.location)}`}
          />
          <button type="button" className="step" onClick={() => bump(1)} aria-label="Increase quantity">
            <Icon name="plus" size={20} />
          </button>
        </div>
        {hasLoc && (
          <button type="button" className="btn in sm" onClick={() => act('IN')} disabled={busy}>
            IN
          </button>
        )}
        <button type="button" className="btn out sm" onClick={() => act('OUT')} disabled={busy || line.qty <= 0}>
          OUT
        </button>
        {canMove && (
          <button type="button" className="btn sm" onClick={() => setMoving(true)}>
            {hasLoc ? 'Move' : 'Set location'}
          </button>
        )}
      </div>
      {err && <div className="err" role="alert">{err}</div>}
      {moving && <MoveSheet item={item} line={line} supplier={supplier} itemRows={itemRows} onClose={() => setMoving(false)} />}
    </div>
  );
}

function MoveSheet({ item, line, supplier, itemRows, onClose }) {
  const auth = useAuth();
  const toast = useToast();
  const [to, setTo] = useState('');
  const [qtyText, setQtyText] = useState(String(line.qty));
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const hasLoc = !!line.location;

  function save() {
    const n = parseNumber(qtyText);
    const qty = Number.isFinite(n) ? n : NaN;
    if (!to) return setErr('Choose the location to move to.');
    try {
      moveStock({ item, supplier, from: line.location, to, qty, itemRows, note, user: userOf(auth) }).catch((e) =>
        toast(
          e.code === 'permission-denied'
            ? `NOT SAVED: move of "${item.name}". Stock changed on another phone meanwhile — try again.`
            : `NOT SAVED: ${e.message}`,
          'err'
        )
      );
    } catch (e) {
      return setErr(e.message);
    }
    toast(`Moved ${fmtNum(qty)} ${item.unit} to ${locationText(to)}`);
    onClose();
  }

  return (
    <Sheet title={hasLoc ? 'Move stock' : 'Set location'} onClose={onClose}>
      <div className="form">
        <div className="si-move-info">
          <b>{item.name}</b>
          <div className="muted tiny">
            {supplier} · {placeText(line.location)} · {fmtNum(line.qty)} {item.unit}
          </div>
        </div>
        <Field label="Move to" htmlFor="mv-to" error={err && !to ? err : ''}>
          <LocationSelect id="mv-to" value={to} onChange={(v) => { setTo(v); setErr(''); }} blank="Choose a location…" exclude={line.location} />
        </Field>
        <Field label={`Quantity (${item.unit})`} htmlFor="mv-qty" error={err && to ? err : ''}>
          <input id="mv-qty" inputMode="decimal" value={qtyText} onChange={(e) => { setQtyText(e.target.value); setErr(''); }} onFocus={(e) => e.target.select()} />
        </Field>
        <Field label="Note (optional)" htmlFor="mv-note">
          <input id="mv-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
        </Field>
        <p className="hint">The item’s total stock does not change. This is saved in History as “Moved”.</p>
        <button className="btn primary big" type="button" onClick={save}>
          {hasLoc ? 'Move stock' : 'Save location'}
        </button>
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------- add / edit supplier (owner)
function SupplierForm({ start, supplierNames, rowsByItem, onClose }) {
  const auth = useAuth();
  const toast = useToast();
  const { items } = useData();
  const editing = !!start.name;
  const [name, setName] = useState(start.name || '');
  const [address, setAddress] = useState(start.address || '');
  const [note, setNote] = useState(start.note || '');
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const [pickQ, setPickQ] = useState('');

  // picked: [{ itemId, entries: [{ key, rowId|null, location, qty }] }]
  const [picked, setPicked] = useState(() => {
    const out = [];
    for (const item of items) {
      const mine = start.name ? rowsForSupplier(rowsByItem.get(item.id), start.name) : [];
      const legacy = start.name && Object.keys(item.bySupplier || {}).some((k) => slug(k) === slug(start.name));
      if (!mine.length && !legacy) continue;
      out.push({ itemId: item.id, entries: mine.map((r) => ({ key: r.id, rowId: r.id, location: r.location, qty: Number(r.qty) || 0 })) });
    }
    return out.sort((a, b) => items.find((i) => i.id === a.itemId).name.localeCompare(items.find((i) => i.id === b.itemId).name));
  });
  const [removedRows, setRemovedRows] = useState([]);
  const keyN = useRef(0);
  const itemOf = (id) => items.find((i) => i.id === id);

  const suggestions = useMemo(() => {
    const taken = new Set(picked.map((p) => p.itemId));
    return searchItems(items.filter((i) => !taken.has(i.id)), pickQ).slice(0, 8);
  }, [items, picked, pickQ]);

  const addItem = (item) => {
    setPicked((p) => [...p, { itemId: item.id, entries: [{ key: `n${keyN.current++}`, rowId: null, location: '', qty: 0 }] }]);
    setPickQ('');
  };
  const setEntry = (itemId, key, patch) =>
    setPicked((p) => p.map((x) => (x.itemId === itemId ? { ...x, entries: x.entries.map((e) => (e.key === key ? { ...e, ...patch } : e)) } : x)));
  const addEntry = (itemId) =>
    setPicked((p) => p.map((x) => (x.itemId === itemId ? { ...x, entries: [...x.entries, { key: `n${keyN.current++}`, rowId: null, location: '', qty: 0 }] } : x)));
  const dropEntry = (itemId, e) => {
    if (e.rowId) setRemovedRows((r) => [...r, e.rowId]);
    setPicked((p) => p.map((x) => (x.itemId === itemId ? { ...x, entries: x.entries.filter((y) => y.key !== e.key) } : x)));
  };
  const dropItem = (p) => {
    p.entries.forEach((e) => e.rowId && setRemovedRows((r) => [...r, e.rowId]));
    setPicked((list) => list.filter((x) => x.itemId !== p.itemId));
  };
  // stock this supplier already holds for the item, with no location yet (kept as it is)
  const legacyQty = (p) => {
    const it = itemOf(p.itemId);
    return Number((it.bySupplier || {})[supplierKey(it, name)]) || 0;
  };
  // an item can only be taken off the supplier when none of its quantities would be lost
  const itemLocked = (p) => p.entries.some((e) => e.qty > 0) || legacyQty(p) > 0;

  async function submit() {
    const e = {};
    const nm = clean(name, 200);
    if (!nm) e.name = 'Please type the supplier name.';
    else if (nm.length > 80) e.name = 'Supplier name can be at most 80 characters.';
    else if (!editing && supplierNames.some((s) => slug(s) === slug(nm))) e.name = 'This supplier already exists.';
    if (clean(address).length > 300) e.address = 'Address can be at most 300 characters.';
    if (clean(note).length > 500) e.note = 'Description can be at most 500 characters.';
    for (const p of picked) {
      const locs = p.entries.map((x) => x.location);
      if (locs.some((l) => !l)) e.items = `Choose a location for every row of “${itemOf(p.itemId).name}”, or remove the row.`;
      else if (new Set(locs).size !== locs.length) e.items = `“${itemOf(p.itemId).name}” has the same location twice.`;
      else if (!locs.length && !legacyQty(p)) e.items = `Add at least one location for “${itemOf(p.itemId).name}”, or remove the item.`;
      if (e.items) break;
    }
    setErrs(e);
    if (Object.keys(e).length) return;

    const addSlots = [];
    for (const p of picked) {
      const it = itemOf(p.itemId);
      const sup = supplierKey(it, nm);
      p.entries.filter((x) => !x.rowId).forEach((x) => addSlots.push({ supplier: sup, itemId: p.itemId, location: x.location }));
    }
    setBusy(true);
    try {
      await saveSupplier({ id: start.id, name: nm, note, address, addSlots, removeSlotIds: removedRows, user: userOf(auth) });
      toast('Supplier saved');
      onClose();
    } catch (err) {
      toast(`Could not save: ${err.message}`, 'err');
    }
    setBusy(false);
  }

  return (
    <Sheet title={editing ? 'Edit supplier' : 'Add supplier'} onClose={onClose} tall>
      <form className="form" onSubmit={(ev) => { ev.preventDefault(); submit(); }}>
        <Field label="Supplier name *" error={errs.name} hint={editing ? 'The name cannot be changed because stock is linked to it.' : undefined} htmlFor="s-name">
          <input id="s-name" value={name} onChange={(ev) => setName(ev.target.value)} readOnly={editing} maxLength={100} autoFocus={!editing} />
        </Field>
        <Field label="Address (optional)" error={errs.address} htmlFor="s-addr">
          <input id="s-addr" value={address} onChange={(ev) => setAddress(ev.target.value)} maxLength={320} />
        </Field>
        <Field label="Description (optional)" error={errs.note} htmlFor="s-note">
          <input id="s-note" value={note} onChange={(ev) => setNote(ev.target.value)} maxLength={520} placeholder="What they supply" />
        </Field>

        <h3 className="sec">Items and locations</h3>
        <Field label="Add an existing item" htmlFor="s-pick" error={errs.items}>
          <input id="s-pick" type="search" value={pickQ} onChange={(ev) => setPickQ(ev.target.value)} placeholder="Type item name or part no.…" autoComplete="off" />
        </Field>
        {pickQ.trim() && (
          <div className="pick-list">
            {suggestions.length === 0 ? (
              <div className="muted tiny">No matching item (or already added).</div>
            ) : (
              suggestions.map((i) => (
                <button key={i.id} type="button" className="pick-row" onClick={() => addItem(i)}>
                  <span className="si-name">{i.name}</span>
                  <span className="si-sub">{partLine(i)}</span>
                </button>
              ))
            )}
          </div>
        )}

        {picked.length === 0 && <p className="hint">No items yet. Search above to add the items this supplier supplies.</p>}
        {picked.map((p) => {
          const it = itemOf(p.itemId);
          const legacyRest = editing ? supplierItemView(it, rowsByItem.get(it.id), name).lines.find((l) => !l.rowId)?.qty || 0 : 0;
          return (
            <div className="si" key={p.itemId}>
              <div className="si-head">
                <div className="si-name">{it.name}</div>
                <div className="si-sub">{partLine(it)}</div>
              </div>
              {legacyRest > 0 && (
                <div className="muted tiny">
                  {fmtNum(legacyRest)} {it.unit} from this supplier has no location yet. After saving, use “Set location” in the list.
                </div>
              )}
              {p.entries.map((en) => (
                <div className="slot" key={en.key}>
                  {en.rowId ? (
                    <div className="slot-loc">
                      {placeText(en.location)} <span className="muted">· {fmtNum(en.qty)} {it.unit}</span>
                    </div>
                  ) : (
                    <LocationSelect value={en.location} onChange={(v) => setEntry(p.itemId, en.key, { location: v })} blank="Choose a location…" aria-label="Location" />
                  )}
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => dropEntry(p.itemId, en)}
                    disabled={en.qty > 0}
                    title={en.qty > 0 ? 'Take the stock OUT or move it first' : 'Remove this location'}
                    aria-label="Remove location"
                  >
                    <Icon name="close" />
                  </button>
                </div>
              ))}
              <div className="row gap">
                <button type="button" className="btn sm" onClick={() => addEntry(p.itemId)}>
                  <Icon name="plus" size={16} /> Location
                </button>
                <button
                  type="button"
                  className="btn sm danger-o"
                  onClick={() => dropItem(p)}
                  disabled={itemLocked(p)}
                  title={itemLocked(p) ? 'This supplier still has stock of this item' : 'Remove item from this supplier'}
                >
                  <Icon name="trash" size={16} /> Remove item
                </button>
              </div>
            </div>
          );
        })}
        <p className="hint">Quantities are added with IN / OUT in the supplier’s item list, so History always explains them.</p>

        <button className="btn primary big" type="submit" disabled={busy}>
          Save supplier
        </button>
      </form>
    </Sheet>
  );
}

import { useDeferredValue, useMemo, useState } from 'react';
import { useAuth } from '../auth.jsx';
import { useData } from '../store.jsx';
import { deletePrice, deleteSupplier, savePrice, saveSupplier } from '../db.js';
import { fmtDate, fmtINR, fmtNum } from '../lib/format.js';
import { UNITS, clean, norm, parseNumber, slug, squish, priceId } from '../lib/text.js';
import { makeHaystack, matchesQuery } from '../lib/search.js';
import { Empty, Field, Icon, Segmented, Sheet, Spinner, SuggestInput, useConfirm, useToast } from '../components/ui.jsx';

export default function Suppliers() {
  const auth = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const { prices, pricesReady, suppliers, items, online } = useData();
  const [deleting, setDeleting] = useState('');
  const [mode, setMode] = useState('supplier');
  const [q, setQ] = useState('');
  const dq = useDeferredValue(q);
  const [open, setOpen] = useState({});
  const [form, setForm] = useState(null); // {price?} | null
  const [supForm, setSupForm] = useState(null);
  const [shown, setShown] = useState(40);

  const supplierNames = useMemo(() => {
    const m = new Map();
    suppliers.forEach((s) => m.set(slug(s.name), s.name));
    prices.forEach((p) => !m.has(slug(p.supplier)) && m.set(slug(p.supplier), p.supplier));
    items.forEach((i) => Object.keys(i.bySupplier || {}).forEach((k) => !m.has(slug(k)) && m.set(slug(k), k)));
    return [...m.values()].sort((a, b) => a.localeCompare(b));
  }, [suppliers, prices, items]);

  const itemNames = useMemo(() => [...new Set([...prices.map((p) => p.item), ...items.map((i) => i.name)])].sort((a, b) => a.localeCompare(b)), [prices, items]);

  // ---- by supplier
  const bySupplier = useMemo(() => {
    const noteOf = new Map(suppliers.map((s) => [slug(s.name), s]));
    // Stock items per supplier: an item belongs to a supplier when its
    // per-supplier breakdown (bySupplier) has an entry for that supplier.
    const stockOf = new Map();
    for (const it of items) {
      for (const [k, qty] of Object.entries(it.bySupplier || {})) {
        const id = slug(k);
        if (!stockOf.has(id)) stockOf.set(id, new Map());
        stockOf.get(id).set(it.id, { item: it, qty: Number(qty) || 0 });
      }
    }
    return supplierNames
      .map((name) => ({
        name,
        dir: noteOf.get(slug(name)),
        stock: [...(stockOf.get(slug(name))?.values() || [])].sort((a, b) => a.item.name.localeCompare(b.item.name)),
        rows: prices.filter((p) => slug(p.supplier) === slug(name)).sort((a, b) => a.item.localeCompare(b.item)),
      }))
      .filter((s) => !dq.trim() || matchesQuery(makeHaystack(s.name, s.dir?.note), dq));
  }, [supplierNames, suppliers, prices, items, dq]);

  async function removeSupplier(s) {
    if (!auth.isOwner) return;
    if (!online) {
      toast('You are offline. Connect to the internet to delete a supplier.', 'err');
      return;
    }
    const ok = await confirm({
      title: `Delete supplier “${s.name}”?`,
      message:
        `${s.stock.length} stock item${s.stock.length === 1 ? '' : 's'} list this supplier. Those items and their quantities are KEPT; only the supplier name is removed from them (quantity then shows as “Other”). ` +
        `${s.rows.length} saved price${s.rows.length === 1 ? '' : 's'} for this supplier will be deleted. Old history entries stay. This cannot be undone.`,
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
        user: { uid: auth.fbUser.uid, name: auth.name, email: auth.fbUser.email },
      });
      toast(`Supplier deleted. ${r.itemsUpdated} stock item${r.itemsUpdated === 1 ? '' : 's'} kept.`);
    } catch (e) {
      toast(`Could not delete supplier: ${e.message}. Nothing was lost; you can try again.`, 'err');
    }
    setDeleting('');
  }

  // ---- compare by item
  const byItem = useMemo(() => {
    const groups = new Map();
    for (const p of prices) {
      if (dq.trim() && !matchesQuery(makeHaystack(p.item, p.partNo), dq)) continue;
      const k = squish(p.partNo) || squish(p.item);
      if (!groups.has(k)) groups.set(k, { key: k, item: p.item, partNo: p.partNo, rows: [] });
      groups.get(k).rows.push(p);
    }
    const arr = [...groups.values()];
    arr.forEach((g) => g.rows.sort((a, b) => a.price - b.price));
    return arr.sort((a, b) => b.rows.length - a.rows.length || a.item.localeCompare(b.item));
  }, [prices, dq]);

  return (
    <>
      <Segmented
        value={mode}
        onChange={(m) => {
          setMode(m);
          setShown(40);
        }}
        options={[
          { value: 'supplier', label: 'By supplier' },
          { value: 'item', label: 'Compare by item' },
        ]}
      />
      <div className="searchbar">
        <Icon name="search" />
        <SuggestInput
          id="sup-search"
          type="search"
          value={q}
          onChange={setQ}
          options={mode === 'supplier' ? supplierNames : itemNames}
          placeholder={mode === 'supplier' ? 'Search supplier name…' : 'Search item or part no. to compare…'}
          aria-label="Search supplier prices"
        />
        {q && (
          <button className="icon-btn" onClick={() => setQ('')} aria-label="Clear">
            <Icon name="close" />
          </button>
        )}
      </div>

      {!pricesReady ? (
        <Spinner label="Loading price list…" />
      ) : mode === 'supplier' ? (
        bySupplier.length === 0 ? (
          <Empty icon="tag" title="No suppliers found">Add a price with the + button, or import your supplier list from More → Import.</Empty>
        ) : (
          <ul className="list">
            {bySupplier.slice(0, shown).map((s) => {
              const isOpen = open[s.name] ?? (dq.trim() !== '' && bySupplier.length <= 3);
              return (
                <li key={s.name} className="card">
                  <button className="card-head" onClick={() => setOpen((o) => ({ ...o, [s.name]: !isOpen }))} aria-expanded={isOpen}>
                    <div>
                      <div className="item-name">{s.name}</div>
                      <div className="item-sub">{s.dir?.note || 'No note'}</div>
                    </div>
                    <span className="count">{s.stock.length} item{s.stock.length === 1 ? '' : 's'}</span>
                  </button>
                  {isOpen && (
                    <div className="card-body">
                      {s.stock.length > 0 && (
                        <div className="sup-stock">
                          <div className="muted tiny">In stock from this supplier</div>
                          {s.stock.slice(0, 50).map(({ item, qty }) => (
                            <div className="sup-stock-line" key={item.id}>
                              <span className="sup-stock-name">
                                {item.name}
                                {item.partNo ? <span className="muted"> · {item.partNo}</span> : null}
                              </span>
                              <b>
                                {fmtNum(qty)} {item.unit}
                              </b>
                            </div>
                          ))}
                          {s.stock.length > 50 && <div className="muted tiny">…and {s.stock.length - 50} more items</div>}
                        </div>
                      )}
                      {s.rows.length === 0 && <p className="muted">No prices recorded for this supplier yet.</p>}
                      {s.rows.map((p) => (
                        <PriceLine key={p.id} p={p} onClick={() => setForm({ price: p })} />
                      ))}
                      <div className="row gap">
                        <button className="btn" onClick={() => setForm({ supplier: s.name })}>
                          <Icon name="plus" size={18} /> Add price
                        </button>
                        <button className="btn" onClick={() => setSupForm(s.dir || { id: slug(s.name), name: s.name, note: '' })}>
                          <Icon name="edit" size={18} /> Edit supplier
                        </button>
                      </div>
                      {auth.isOwner && (
                        <button className="btn danger-o" onClick={() => removeSupplier(s)} disabled={!!deleting}>
                          <Icon name="trash" size={18} /> {deleting === s.name ? 'Deleting…' : 'Delete supplier'}
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
            {bySupplier.length > shown && (
              <li>
                <button className="btn" onClick={() => setShown((n) => n + 40)}>Show more</button>
              </li>
            )}
          </ul>
        )
      ) : byItem.length === 0 ? (
        <Empty icon="rupee" title="No prices found">Search by item name or part number to compare suppliers side by side.</Empty>
      ) : (
        <ul className="list">
          {byItem.slice(0, shown).map((g) => (
            <li key={g.key} className="card">
              <div className="card-head static">
                <div>
                  <div className="item-name">{g.item}</div>
                  <div className="item-sub">{g.partNo || 'No part no.'}</div>
                </div>
                <span className="count">{g.rows.length} supplier{g.rows.length === 1 ? '' : 's'}</span>
              </div>
              <div className="card-body">
                {g.rows.map((p, idx) => (
                  <PriceLine key={p.id} p={p} showSupplier best={g.rows.length > 1 && idx === 0} onClick={() => setForm({ price: p })} />
                ))}
              </div>
            </li>
          ))}
          {byItem.length > shown && (
            <li>
              <button className="btn" onClick={() => setShown((n) => n + 40)}>Show more</button>
            </li>
          )}
        </ul>
      )}

      <button className="fab" onClick={() => setForm({})} aria-label="Add supplier price">
        <Icon name="plus" size={28} />
      </button>

      {form && <PriceForm start={form} supplierNames={supplierNames} itemNames={itemNames} onClose={() => setForm(null)} />}
      {supForm && <SupplierForm sup={supForm} onClose={() => setSupForm(null)} />}
    </>
  );
}

function PriceLine({ p, onClick, showSupplier, best }) {
  const d = p.updatedAt?.toDate?.();
  return (
    <button className={`price-line ${best ? 'best' : ''}`} onClick={onClick}>
      <div className="pl-main">
        <div className="pl-name">{showSupplier ? p.supplier : p.item}</div>
        <div className="muted tiny">
          {!showSupplier && p.partNo ? `${p.partNo} · ` : ''}
          {p.note ? `${p.note} · ` : ''}
          updated {fmtDate(d, true) || 'just now'}
        </div>
      </div>
      <div className="pl-price">
        <b>{fmtINR(p.price)}</b>
        <span className="muted tiny">/{p.unit}</span>
        {best && <span className="tag good">Lowest</span>}
        {p.prevPrice != null && p.prevPrice !== p.price && (
          <div className={`was ${p.price > p.prevPrice ? 'up' : 'down'}`}>was {fmtINR(p.prevPrice)}</div>
        )}
      </div>
    </button>
  );
}

function PriceForm({ start, supplierNames, itemNames, onClose }) {
  const auth = useAuth();
  const { items, prices, suppliers } = useData();
  const toast = useToast();
  const confirm = useConfirm();
  const orig = start.price;
  const [f, setF] = useState({
    supplier: orig?.supplier || start.supplier || '',
    item: orig?.item || '',
    partNo: orig?.partNo || '',
    price: orig ? String(orig.price) : '',
    unit: orig?.unit || 'pcs',
    note: orig?.note || '',
  });
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: typeof v === 'string' ? v : v.target.value }));

  function fillFromStock() {
    const m = items.find((i) => norm(i.name) === norm(f.item));
    if (m) setF((s) => ({ ...s, partNo: s.partNo || m.partNo, unit: orig ? s.unit : m.unit }));
  }

  async function submit() {
    const e = {};
    const supplier = clean(f.supplier, 200);
    const item = clean(f.item, 200);
    const partNo = clean(f.partNo, 100);
    const price = parseNumber(f.price);
    if (!supplier) e.supplier = 'Please type the supplier name.';
    else if (supplier.length > 80) e.supplier = 'Supplier name can be at most 80 characters.';
    if (!item) e.item = 'Please type the item name.';
    else if (item.length > 120) e.item = 'Item name can be at most 120 characters.';
    if (partNo.length > 60) e.partNo = 'Part no. can be at most 60 characters.';
    if (price === null || Number.isNaN(price) || price <= 0) e.price = 'Enter a price in rupees, greater than 0.';
    else if (price >= 100000000) e.price = 'That price is too large.';
    if (clean(f.note).length > 200) e.note = 'Note can be at most 200 characters.';
    if (!e.supplier && !e.item) {
      const id = priceId(supplier, item, partNo);
      if (prices.some((p) => p.id === id && p.id !== orig?.id)) e.item = 'This supplier already has a price for this item. Open that price to change it.';
    }
    setErrs(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      await savePrice({
        original: orig,
        data: { supplier, item, partNo, price, unit: f.unit, note: f.note },
        user: { uid: auth.fbUser.uid },
        existingSupplierIds: new Set(suppliers.map((s) => s.id)),
      });
      toast('Price saved');
      onClose();
    } catch (err) {
      toast(`Could not save: ${err.message}`, 'err');
    }
    setBusy(false);
  }

  async function remove() {
    if (!(await confirm({ title: 'Delete this price?', message: `${orig.supplier} — ${orig.item}`, okText: 'Delete', danger: true }))) return;
    try {
      await deletePrice(orig.id);
      toast('Price deleted');
      onClose();
    } catch (err) {
      toast(`Could not delete: ${err.message}`, 'err');
    }
  }

  const newPrice = parseNumber(f.price);
  return (
    <Sheet title={orig ? 'Edit price' : 'Add supplier price'} onClose={onClose} tall>
      <form
        className="form"
        onSubmit={(ev) => {
          ev.preventDefault();
          submit();
        }}
      >
        <Field label="Supplier / manufacturer *" error={errs.supplier} htmlFor="p-sup">
          <SuggestInput id="p-sup" value={f.supplier} onChange={set('supplier')} options={supplierNames} maxLength={100} />
        </Field>
        <Field label="Item *" error={errs.item} htmlFor="p-item">
          <SuggestInput id="p-item" value={f.item} onChange={set('item')} options={itemNames} maxLength={140} onBlur={fillFromStock} />
        </Field>
        <div className="grid2">
          <Field label="Part no." error={errs.partNo} htmlFor="p-part">
            <input id="p-part" value={f.partNo} onChange={set('partNo')} maxLength={80} />
          </Field>
          <Field label="Unit" htmlFor="p-unit">
            <select id="p-unit" value={f.unit} onChange={set('unit')}>
              {UNITS.map((u) => <option key={u}>{u}</option>)}
            </select>
          </Field>
        </div>
        <Field
          label="Price (₹) *"
          error={errs.price}
          hint={orig && Number.isFinite(newPrice) && newPrice !== orig.price ? `Will change from ${fmtINR(orig.price)} to ${fmtINR(newPrice)}` : undefined}
          htmlFor="p-price"
        >
          <input id="p-price" inputMode="decimal" value={f.price} onChange={set('price')} placeholder="0" />
        </Field>
        <Field label="Note" error={errs.note} htmlFor="p-note">
          <input id="p-note" value={f.note} onChange={set('note')} maxLength={220} />
        </Field>
        <button className="btn primary big" type="submit" disabled={busy}>Save price</button>
        {orig && (
          <button type="button" className="btn danger-o" onClick={remove}>
            <Icon name="trash" size={18} /> Delete this price
          </button>
        )}
      </form>
    </Sheet>
  );
}

function SupplierForm({ sup, onClose }) {
  const toast = useToast();
  const [name, setName] = useState(sup.name);
  const [note, setNote] = useState(sup.note || '');
  const [err, setErr] = useState('');
  async function submit() {
    if (!clean(name)) return setErr('Please type the supplier name.');
    if (clean(name).length > 80) return setErr('Name can be at most 80 characters.');
    if (clean(note).length > 200) return setErr('Note can be at most 200 characters.');
    try {
      await saveSupplier({ id: sup.id, name, note });
      toast('Supplier saved');
      onClose();
    } catch (e) {
      toast(`Could not save: ${e.message}`, 'err');
    }
  }
  return (
    <Sheet title="Edit supplier" onClose={onClose}>
      <form className="form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Field label="Supplier name" error={err} hint="The name cannot be changed because prices are linked to it." htmlFor="s-name">
          <input id="s-name" value={name} readOnly />
        </Field>
        <Field label="Reference / what they supply" htmlFor="s-note">
          <input id="s-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={220} />
        </Field>
        <button className="btn primary big" type="submit">Save</button>
      </form>
    </Sheet>
  );
}

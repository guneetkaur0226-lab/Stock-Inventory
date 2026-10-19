import { useMemo, useState } from 'react';
import { Autocomplete, ConfirmButton, Field, Sheet, useToast } from '../ui/kit';
import { useData } from '../state/DataContext';
import { UNITS, clean, priceKey } from '../lib/keys';
import { fmtMoney, parseNumber } from '../lib/format';
import { deletePrice, savePrice } from '../lib/ops';
import { friendly } from '../lib/errors';

export default function PriceForm({ profile, record, onClose, initial }) {
  const { prices, items, supplierNames } = useData();
  const toast = useToast();
  const [f, setF] = useState(record
    ? { supplier: record.supplier, item: record.item, partNo: record.partNo || '', price: String(record.price), unit: record.unit, note: record.note || '' }
    : { supplier: initial?.supplier || '', item: initial?.item || '', partNo: initial?.partNo || '', price: '', unit: 'pcs', note: '' });
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fail, setFail] = useState('');
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const itemOptions = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const it of items) { const k = it.name.toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push({ label: it.name, sub: it.partNo || '', partNo: it.partNo || '', unit: it.unit }); } }
    for (const p of prices) { const k = p.item.toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push({ label: p.item, sub: p.partNo || '', partNo: p.partNo || '', unit: p.unit }); } }
    return out;
  }, [items, prices]);

  const price = f.price.trim() === '' ? NaN : parseNumber(f.price);
  const e = {};
  if (!clean(f.supplier)) e.supplier = 'Enter the supplier or manufacturer.';
  else if (clean(f.supplier).length > 100) e.supplier = 'Name is too long (max 100).';
  if (!clean(f.item)) e.item = 'Enter the item.';
  else if (clean(f.item).length > 120) e.item = 'Item name is too long (max 120).';
  if (clean(f.partNo).length > 60) e.partNo = 'Part number is too long (max 60).';
  if (f.price.trim() === '') e.price = 'Enter the price in ₹.';
  else if (Number.isNaN(price) || price <= 0) e.price = 'Enter a price above 0, like 1250 or 1250.50.';
  else if (price > 10000000) e.price = 'That price is too big.';
  if (clean(f.note).length > 200) e.note = 'Note is too long (max 200).';

  const key = priceKey(f);
  const clash = !e.supplier && !e.item ? prices.find((p) => priceKey(p) === key && p.id !== record?.id) : null;
  if (record && clash) e.item = `${clean(f.supplier)} already has this item in the list (${fmtMoney(clash.price)}). Edit that entry instead.`;
  const target = record || clash || null; // adding something that exists = update its price
  const shownErr = show ? e : {};
  const rounded = Math.round(price * 100) / 100;

  async function save() {
    setShow(true); setFail('');
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      await savePrice(profile, { ...f, price: rounded }, target);
      toast(target && Number(target.price) !== rounded ? `Price updated (was ${fmtMoney(target.price)})` : target ? 'Saved' : 'Price added');
      onClose();
    } catch (err) { setFail(friendly(err)); setSaving(false); }
  }
  async function remove() {
    try { await deletePrice(record.id); toast('Price deleted'); onClose(); } catch (err) { setFail(friendly(err)); }
  }

  return (
    <Sheet title={record ? 'Edit price' : 'Add price'} onClose={onClose} bare>
      <div className="sheet-body">
        <Autocomplete label="Supplier / manufacturer *" value={f.supplier} onChange={(v) => set('supplier', v)} options={supplierNames} error={shownErr.supplier} placeholder="e.g. Arjun" maxLength={100} />
        <Autocomplete label="Item *" value={f.item} onChange={(v) => set('item', v)} options={itemOptions} error={shownErr.item} placeholder="e.g. Carbon brush set"
          onPick={(o) => { if (typeof o !== 'string') { setF((p) => ({ ...p, partNo: p.partNo || o.partNo, unit: p.unit === 'pcs' && o.unit ? o.unit : p.unit })); } }} />
        <Field label="Part number" error={shownErr.partNo}>
          <input value={f.partNo} maxLength={60} onChange={(ev) => set('partNo', ev.target.value)} placeholder="optional" autoCapitalize="characters" />
        </Field>
        <div className="row2">
          <Field label="Price (₹) *" error={shownErr.price}>
            <input value={f.price} inputMode="decimal" onChange={(ev) => set('price', ev.target.value)} placeholder="0" />
          </Field>
          <Field label="Per unit">
            <select value={f.unit} onChange={(ev) => set('unit', ev.target.value)}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select>
          </Field>
        </div>
        <Field label="Note" error={shownErr.note}>
          <input value={f.note} maxLength={200} onChange={(ev) => set('note', ev.target.value)} placeholder="optional, e.g. minimum order 10" />
        </Field>
        {target && !Number.isNaN(price) && price > 0 && (
          <div className="banner info">
            {Number(target.price) !== rounded
              ? <>Price changes from <b>{fmtMoney(target.price)}</b> to <b>{fmtMoney(rounded)}</b>. The old price is kept as “was {fmtMoney(target.price)}”.</>
              : <>Same price as before ({fmtMoney(target.price)}).</>}
            {!record && <> This supplier already had this item, so the existing entry will be updated.</>}
          </div>
        )}
        {fail && <div className="banner error" role="alert">{fail}</div>}
        {record && <div className="actions-sec"><ConfirmButton label="Delete this price" confirmLabel="Tap again to delete" onConfirm={remove} className="btn danger-ghost" /></div>}
      </div>
      <div className="sheet-foot split">
        <button className="btn ghost" onClick={onClose} disabled={saving}>Cancel</button>
        <button className="btn primary big" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save price'}</button>
      </div>
    </Sheet>
  );
}

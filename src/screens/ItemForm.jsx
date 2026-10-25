import { useMemo, useState } from 'react';
import { Field, SuggestInput } from '../components/ui.jsx';
import LocationSelect from '../components/LocationSelect.jsx';
import { UNITS, INTEGER_UNITS, parseNumber, squish, clean } from '../lib/text.js';

/** Used for both "add item" and (owner) "edit item". */
export default function ItemForm({ mode, item, items, supplierNames, onSubmit, busy }) {
  const editing = mode === 'edit';
  const [f, setF] = useState({
    name: item?.name || '',
    partNo: item?.partNo || '',
    brand: item?.brand || '',
    model: item?.model || '',
    unit: item?.unit || 'pcs',
    minQty: item ? String(item.minQty || '') : '',
    qty: '',
    supplier: '',
    location: '',
    note: '',
  });
  const [errs, setErrs] = useState({});
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: typeof v === 'string' ? v : v.target.value }));

  const brands = useMemo(() => [...new Set(items.map((i) => i.brand).filter(Boolean))].sort(), [items]);
  const models = useMemo(() => [...new Set(items.map((i) => i.model).filter(Boolean))].sort(), [items]);

  function submit() {
    const e = {};
    const name = clean(f.name, 200);
    const partNo = clean(f.partNo, 100);
    if (!name) e.name = 'Please type the item name.';
    else if (name.length > 120) e.name = 'Name can be at most 120 characters.';
    if (partNo.length > 60) e.partNo = 'Part no. can be at most 60 characters.';
    if (clean(f.brand).length > 60) e.brand = 'Brand can be at most 60 characters.';
    if (clean(f.model).length > 120) e.model = 'Model can be at most 120 characters.';
    const min = f.minQty === '' ? 0 : parseNumber(f.minQty);
    if (Number.isNaN(min) || min < 0) e.minQty = 'Minimum stock must be a number, 0 or more.';
    let qty = 0;
    if (!editing) {
      qty = f.qty === '' ? 0 : parseNumber(f.qty);
      if (Number.isNaN(qty) || qty < 0) e.qty = 'Opening stock must be a number, 0 or more.';
      else if (INTEGER_UNITS.includes(f.unit) && !Number.isInteger(qty)) e.qty = `Use a whole number for ${f.unit}.`;
      else if (qty > 1000000) e.qty = 'That quantity is too large.';
    }
    if (!e.name) {
      const pk = squish(partNo);
      const nk = squish(name);
      const dup = items.find(
        (i) => i.id !== item?.id && (pk ? squish(i.partNo) === pk || (squish(i.name) === nk && squish(i.partNo) === pk) : squish(i.name) === nk && !squish(i.partNo))
      );
      if (dup) {
        if (pk && squish(dup.partNo) === pk) e.partNo = `Part no. already used by "${dup.name}".`;
        else e.name = `"${dup.name}" is already in the list.`;
      }
    }
    setErrs(e);
    if (Object.keys(e).length) return;
    onSubmit({ name, partNo, brand: clean(f.brand, 60), model: clean(f.model, 120), unit: f.unit, minQty: min, qty, supplier: clean(f.supplier, 80), location: clean(f.supplier, 80) && qty > 0 ? f.location : '', note: clean(f.note, 300) });
  }

  return (
    <form
      className="form"
      onSubmit={(ev) => {
        ev.preventDefault();
        submit();
      }}
    >
      <Field label="Item name *" error={errs.name} htmlFor="f-name">
        <input id="f-name" value={f.name} onChange={set('name')} maxLength={140} placeholder="e.g. Carbon brush set" autoFocus={!editing} />
      </Field>
      <div className="grid2">
        <Field label="Part no." error={errs.partNo} htmlFor="f-part">
          <input id="f-part" value={f.partNo} onChange={set('partNo')} maxLength={80} />
        </Field>
        <Field label="Brand" error={errs.brand} htmlFor="f-brand">
          <SuggestInput id="f-brand" value={f.brand} onChange={set('brand')} options={brands} maxLength={80} />
        </Field>
      </div>
      <Field label="Fits generator / motor model" error={errs.model} htmlFor="f-model">
        <SuggestInput id="f-model" value={f.model} onChange={set('model')} options={models} maxLength={140} placeholder="e.g. Kirloskar 5 kVA" />
      </Field>
      <div className="grid2">
        <Field label="Unit" htmlFor="f-unit">
          <select id="f-unit" value={f.unit} onChange={set('unit')}>
            {UNITS.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </Field>
        <Field label="Alert when stock is at or below" error={errs.minQty} htmlFor="f-min">
          <input id="f-min" inputMode="decimal" value={f.minQty} onChange={set('minQty')} placeholder="0 = no alert" />
        </Field>
      </div>
      {!editing && (
        <>
          <div className="grid2">
            <Field label="Opening stock" error={errs.qty} htmlFor="f-qty">
              <input id="f-qty" inputMode="decimal" value={f.qty} onChange={set('qty')} placeholder="0" />
            </Field>
            <Field label="From supplier (optional)" htmlFor="f-sup">
              <SuggestInput id="f-sup" value={f.supplier} onChange={set('supplier')} options={supplierNames} maxLength={80} />
            </Field>
          </div>
          {clean(f.supplier, 80) && (
            <Field label="Store at location (optional)" hint="Only used when there is opening stock." htmlFor="f-loc">
              <LocationSelect id="f-loc" value={f.location} onChange={set('location')} blank="No location set" />
            </Field>
          )}
          <Field label="Note (optional)" htmlFor="f-note">
            <input id="f-note" value={f.note} onChange={set('note')} maxLength={300} />
          </Field>
        </>
      )}
      {editing && <p className="hint">Quantity can only be changed with stock IN / OUT so the history stays correct.</p>}
      <button className="btn primary big" type="submit" disabled={busy}>
        {editing ? 'Save changes' : 'Add item'}
      </button>
    </form>
  );
}

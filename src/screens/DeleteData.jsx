import { useMemo, useState } from 'react';
import { useAuth } from '../auth.jsx';
import { useData } from '../store.jsx';
import { deleteItem, deleteSupplier } from '../db.js';
import { fmtNum } from '../lib/format.js';
import { slug } from '../lib/text.js';
import { searchItems } from '../lib/search.js';
import { Icon, useConfirm, useToast } from '../components/ui.jsx';

const userOf = (auth) => ({ uid: auth.fbUser.uid, name: auth.name, email: auth.fbUser.email });

/** Owner only. Deleting a supplier or a stock item lives here, behind two confirmations. */
export default function DeleteData() {
  const auth = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const { items, suppliers, prices, locStock, online } = useData();
  const [supQ, setSupQ] = useState('');
  const [itemQ, setItemQ] = useState('');
  const [busy, setBusy] = useState('');

  const supplierRows = useMemo(() => {
    const names = new Map();
    suppliers.forEach((s) => names.set(slug(s.name), s.name));
    items.forEach((i) => Object.keys(i.bySupplier || {}).forEach((k) => !names.has(slug(k)) && names.set(slug(k), k)));
    locStock.forEach((r) => !names.has(slug(r.supplier)) && names.set(slug(r.supplier), r.supplier));
    return [...names.entries()]
      .map(([key, name]) => ({ key, name, items: items.filter((i) => Object.keys(i.bySupplier || {}).some((k) => slug(k) === key)).length }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [suppliers, items, locStock]);

  const shownSuppliers = supplierRows.filter((s) => !supQ.trim() || s.name.toLowerCase().includes(supQ.trim().toLowerCase())).slice(0, 30);
  const shownItems = useMemo(() => (itemQ.trim() ? searchItems(items, itemQ).slice(0, 30) : []), [items, itemQ]);

  async function removeSupplier(s) {
    if (!online) return toast('You are offline. Connect to the internet to delete a supplier.', 'err');
    const nLoc = locStock.filter((r) => slug(r.supplier) === s.key).length;
    const first = await confirm({
      title: `Delete supplier “${s.name}”?`,
      message:
        `${s.items} stock item${s.items === 1 ? ' is' : 's are'} linked to this supplier. The items and their total quantities are KEPT; only the supplier name${nLoc ? ' and its location quantities' : ''} are removed from them (the quantity then shows as “Other”). ` +
        'Old History entries stay. Tip: save a backup first (More → Backup).',
      okText: 'Continue',
      danger: true,
    });
    if (!first) return;
    const second = await confirm({
      title: 'Are you absolutely sure?',
      message: `“${s.name}” will be deleted permanently. This is your last chance to cancel.`,
      okText: 'Yes, delete supplier',
      danger: true,
    });
    if (!second) return;
    setBusy(s.key);
    try {
      const r = await deleteSupplier({
        name: s.name,
        docIds: suppliers.filter((x) => slug(x.name) === s.key).map((x) => x.id),
        items,
        prices,
        locRows: locStock,
        user: userOf(auth),
      });
      toast(`Supplier deleted. ${r.itemsUpdated} stock item${r.itemsUpdated === 1 ? '' : 's'} kept.`);
    } catch (e) {
      toast(`Could not delete supplier: ${e.message}. Nothing was lost; you can try again.`, 'err');
    }
    setBusy('');
  }

  async function removeItem(item) {
    const rows = locStock.filter((r) => r.itemId === item.id);
    const first = await confirm({
      title: `Delete item “${item.name}”?`,
      message: `It currently has ${fmtNum(item.qty)} ${item.unit} in stock. The item and its supplier / location quantities will be removed from the stock list. Its history stays in the history log. Tip: save a backup first (More → Backup).`,
      okText: 'Continue',
      danger: true,
    });
    if (!first) return;
    const second = await confirm({
      title: 'Are you absolutely sure?',
      message: `“${item.name}” will be deleted permanently. This is your last chance to cancel.`,
      okText: 'Yes, delete item',
      danger: true,
    });
    if (!second) return;
    setBusy(item.id);
    try {
      await deleteItem({ item, itemRows: rows, user: userOf(auth) });
      toast('Item deleted');
    } catch (e) {
      toast(`Not deleted: ${e.message}`, 'err');
    }
    setBusy('');
  }

  if (!auth.isOwner) return <p className="muted">Only the owner can delete suppliers or stock items.</p>;

  return (
    <>
      <p className="muted tiny">Each delete asks you twice. Your history log is never deleted here.</p>

      <div className="card pad form">
        <b>Delete a supplier</b>
        <input type="search" value={supQ} onChange={(e) => setSupQ(e.target.value)} placeholder="Search supplier…" autoComplete="off" aria-label="Search supplier" />
        {shownSuppliers.length === 0 && <div className="muted tiny">No supplier found.</div>}
        {shownSuppliers.map((s) => (
          <div className="slot" key={s.key}>
            <div className="slot-loc">
              {s.name} <span className="muted">· {s.items} item{s.items === 1 ? '' : 's'}</span>
            </div>
            <button className="icon-btn danger" onClick={() => removeSupplier(s)} disabled={!!busy} aria-label={`Delete supplier ${s.name}`}>
              <Icon name="trash" size={20} />
            </button>
          </div>
        ))}
      </div>

      <div className="card pad form">
        <b>Delete a stock item</b>
        <input type="search" value={itemQ} onChange={(e) => setItemQ(e.target.value)} placeholder="Type the item name…" autoComplete="off" aria-label="Search item" />
        {itemQ.trim() && shownItems.length === 0 && <div className="muted tiny">No item found.</div>}
        {shownItems.map((i) => (
          <div className="slot" key={i.id}>
            <div className="slot-loc">
              {i.name} <span className="muted">· {fmtNum(i.qty)} {i.unit}</span>
            </div>
            <button className="icon-btn danger" onClick={() => removeItem(i)} disabled={!!busy} aria-label={`Delete item ${i.name}`}>
              <Icon name="trash" size={20} />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

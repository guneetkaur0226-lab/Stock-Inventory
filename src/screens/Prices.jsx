import { useDeferredValue, useMemo, useState } from 'react';
import { useData } from '../state/DataContext';
import { Empty, Icon, Segmented } from '../ui/kit';
import { fmtDate, fmtMoney } from '../lib/format';
import { textMatches, tokenize } from '../lib/search';
import { squash } from '../lib/keys';
import PriceForm from './PriceForm';

function Was({ p }) {
  if (p.prevPrice == null || Number(p.prevPrice) === Number(p.price)) return null;
  const up = p.price > p.prevPrice;
  return <span className={'was ' + (up ? 'up' : 'down')}>{up ? '▲' : '▼'} was {fmtMoney(p.prevPrice)}</span>;
}

function PriceRow({ p, mode, lowest, diff, onOpen }) {
  return (
    <button className="price-row" onClick={() => onOpen(p)}>
      <div className="pr-main">
        <div className="pr-title">{mode === 'item' ? p.supplier : p.item}</div>
        <div className="pr-sub">
          {mode === 'supplier' && p.partNo ? <span>{p.partNo}</span> : null}
          <span>Updated {fmtDate(p.updatedAt)}</span>
          {p.note ? <span>{p.note}</span> : null}
        </div>
      </div>
      <div className="pr-price">
        <b>{fmtMoney(p.price)}<small>/{p.unit}</small></b>
        <Was p={p} />
        {lowest ? <span className="badge ok">Lowest</span> : diff > 0 ? <span className="diff">+{fmtMoney(diff)}</span> : null}
      </div>
    </button>
  );
}

export default function Prices({ profile }) {
  const { prices } = useData();
  const [q, setQ] = useState('');
  const dq = useDeferredValue(q);
  const [view, setView] = useState('auto');
  const [edit, setEdit] = useState(null); // record | 'new'

  const tokens = tokenize(dq);
  const matchedSuppliers = useMemo(() => {
    if (!tokens.length) return [];
    const names = [...new Set(prices.map((p) => p.supplier))];
    return names.filter((n) => textMatches(n, tokens));
  }, [prices, dq]); // eslint-disable-line react-hooks/exhaustive-deps

  const mode = view === 'auto' ? (!tokens.length || matchedSuppliers.length ? 'supplier' : 'item') : view;

  const groups = useMemo(() => {
    const out = new Map();
    if (mode === 'supplier') {
      let rows = prices;
      if (tokens.length) {
        rows = matchedSuppliers.length
          ? prices.filter((p) => matchedSuppliers.includes(p.supplier))
          : prices.filter((p) => textMatches([p.item, p.partNo, p.note].join(' '), tokens));
      }
      for (const p of rows) {
        const k = squash(p.supplier);
        if (!out.has(k)) out.set(k, { title: p.supplier, rows: [] });
        out.get(k).rows.push(p);
      }
      for (const g of out.values()) g.rows.sort((a, b) => a.item.localeCompare(b.item));
    } else {
      const rows = tokens.length ? prices.filter((p) => textMatches([p.item, p.partNo].join(' '), tokens)) : prices;
      for (const p of rows) {
        const k = p.partNo ? 'p:' + squash(p.partNo) : 'n:' + squash(p.item);
        if (!out.has(k)) out.set(k, { title: p.item, sub: p.partNo, rows: [] });
        out.get(k).rows.push(p);
      }
      for (const g of out.values()) g.rows.sort((a, b) => a.price - b.price);
    }
    return [...out.values()].sort((a, b) => a.title.localeCompare(b.title));
  }, [prices, dq, mode, matchedSuppliers]); // eslint-disable-line react-hooks/exhaustive-deps

  const hint = !tokens.length ? null
    : mode === 'supplier' && matchedSuppliers.length ? `Everything supplied by ${matchedSuppliers.join(', ')}`
    : mode === 'item' ? 'Compare suppliers for each matching item — the lowest price is marked'
    : null;

  return (
    <>
      <div className="searchbar">
        <Icon name="search" />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search supplier, item or part no…" aria-label="Search supplier prices" />
        {q && <button className="icon-btn" onClick={() => setQ('')} aria-label="Clear"><Icon name="x" /></button>}
      </div>
      <div className="pad-x">
        <Segmented value={view} onChange={setView} options={[{ value: 'auto', label: 'Auto' }, { value: 'supplier', label: 'By supplier' }, { value: 'item', label: 'Compare by item' }]} />
      </div>
      {hint && <p className="tiny muted pad-x">{hint}</p>}

      <div className="list">
        {prices.length === 0 && <Empty icon="rupee" title="No supplier prices yet">Tap + to add one, or import a sheet from More → Import / Export.</Empty>}
        {prices.length > 0 && groups.length === 0 && <Empty icon="search" title="Nothing found">No supplier or item matches “{dq}”.</Empty>}
        {groups.map((g) => {
          const low = mode === 'item' && g.rows.length > 1 ? g.rows[0].price : null;
          const allSame = low != null && g.rows.every((r) => r.price === low);
          return (
            <section key={g.title + (g.sub || '')} className="group">
              <header>
                <h3>{g.title}{g.sub ? <small> · {g.sub}</small> : null}</h3>
                <span className="muted small">{g.rows.length} {mode === 'supplier' ? 'items' : g.rows.length === 1 ? 'supplier' : 'suppliers'}</span>
              </header>
              {g.rows.map((p) => (
                <PriceRow key={p.id} p={p} mode={mode} lowest={low != null && !allSame && p.price === low} diff={low != null && !allSame ? p.price - low : 0} onOpen={setEdit} />
              ))}
            </section>
          );
        })}
      </div>

      <button className="fab" onClick={() => setEdit('new')} aria-label="Add supplier price"><Icon name="plus" size={28} /></button>
      {edit && (
        <PriceForm profile={profile} record={edit === 'new' ? null : edit} onClose={() => setEdit(null)}
          initial={edit === 'new' && matchedSuppliers.length === 1 ? { supplier: matchedSuppliers[0] } : undefined} />
      )}
    </>
  );
}

import { useState } from 'react';
import { useData } from '../store.jsx';
import { fetchAllMovements } from '../db.js';
import { downloadCsv, downloadXlsx } from '../lib/csv.js';
import { historyRows, priceRows, stockRows, TEMPLATE_SHEETS } from '../lib/exporter.js';
import { Icon, useToast } from '../components/ui.jsx';

export default function Export() {
  const { items, prices } = useData();
  const toast = useToast();
  const [busy, setBusy] = useState('');
  const today = new Date().toISOString().slice(0, 10);

  async function run(kind, fmt) {
    setBusy(kind + fmt);
    try {
      let rows;
      let name;
      if (kind === 'stock') {
        rows = stockRows(items);
        name = 'Stock';
      } else if (kind === 'prices') {
        rows = priceRows(prices);
        name = 'Supplier Prices';
      } else {
        rows = historyRows(await fetchAllMovements());
        name = 'History';
      }
      const file = `${name.toLowerCase().replace(/ /g, '-')}-${today}`;
      if (fmt === 'csv') downloadCsv(`${file}.csv`, rows);
      else await downloadXlsx(`${file}.xlsx`, [{ name, rows }]);
      toast(`Downloaded ${rows.length - 1} rows`);
    } catch (e) {
      toast(`Export failed: ${e.message}`, 'err');
    }
    setBusy('');
  }

  const Card = ({ id, title, text }) => (
    <div className="card pad">
      <b>{title}</b>
      <p className="muted tiny">{text}</p>
      <div className="row gap">
        <button className="btn" disabled={!!busy} onClick={() => run(id, 'csv')}>
          <Icon name="download" size={18} /> CSV
        </button>
        <button className="btn" disabled={!!busy} onClick={() => run(id, 'xlsx')}>
          <Icon name="download" size={18} /> Excel
        </button>
      </div>
    </div>
  );

  return (
    <>
      <Card id="stock" title={`Stock (${items.length} items)`} text="Name, Part No, Brand, Model, Qty, Unit, Min Stock, plus one column per supplier. Can be imported back." />
      <Card id="prices" title={`Supplier prices (${prices.length})`} text="Supplier, Item, Part No, Price, Unit, Note, Last Updated, Previous Price. Can be imported back." />
      <Card id="history" title="History (all entries)" text="Date, Time, Type, Item, Part No, Qty, Unit, Stock After, Supplier, Note, By. For records only — history cannot be imported." />
      <div className="card pad">
        <b>Blank import template</b>
        <p className="muted tiny">An Excel file with the correct headings for stock, stock-by-supplier, supplier prices and suppliers.</p>
        <button className="btn" onClick={() => downloadXlsx('import-template.xlsx', TEMPLATE_SHEETS)}>
          <Icon name="download" size={18} /> Download template
        </button>
      </div>
    </>
  );
}

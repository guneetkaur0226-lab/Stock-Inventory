import { useState } from 'react';
import { fmtDate } from '../lib/format.js';
import MoveRow from './MoveRow.jsx';

/** History grouped by date: one card per day; tap a day to open its entries. `moves` is newest first. */
export default function DayCards({ moves, openByDefault = false }) {
  const [open, setOpen] = useState({});
  const days = [];
  for (const m of moves) {
    const d = m.at?.toDate?.();
    const label = d ? fmtDate(d, true) : 'Today';
    const last = days[days.length - 1];
    if (last && last.label === label) last.items.push(m);
    else days.push({ label, items: [m] });
  }
  return (
    <ul className="list">
      {days.map((day) => {
        const isOpen = open[day.label] ?? openByDefault;
        return (
          <li key={day.label} className="card">
            <button className="card-head" onClick={() => setOpen((o) => ({ ...o, [day.label]: !isOpen }))} aria-expanded={isOpen}>
              <div className="sup-head-main">
                <div className="item-name">{day.label}</div>
              </div>
              <span className="count">
                {day.items.length} {day.items.length === 1 ? 'entry' : 'entries'} {isOpen ? '▴' : '▾'}
              </span>
            </button>
            {isOpen && (
              <div className="card-body">
                {day.items.map((m) => (
                  <MoveRow key={m.id} m={m} />
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

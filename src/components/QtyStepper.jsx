import { Icon } from './ui.jsx';
import { parseNumber } from '../lib/text.js';

/**
 * − [ number ] +  control. `value` is the text in the box (so a half-typed number is never lost).
 * `allowNegative` is used where the number means "change" (+ for IN, − for OUT).
 */
export default function QtyStepper({ value, onChange, decimal = false, allowNegative = false, label = 'Quantity', compact = false }) {
  const bump = (d) => {
    const n = parseNumber(value);
    const cur = Number.isFinite(n) ? n : 0;
    let next = Math.round((cur + d) * 1000) / 1000;
    if (!allowNegative) next = Math.max(0, next);
    onChange(String(next));
  };
  return (
    <div className={`qstep ${compact ? 'compact' : ''}`}>
      <button type="button" className="qstep-btn" onClick={() => bump(-1)} aria-label={`Decrease ${label}`}>
        <Icon name="minus" size={22} />
      </button>
      <input
        inputMode={allowNegative ? 'text' : decimal ? 'decimal' : 'numeric'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={(e) => e.target.select()}
        aria-label={label}
      />
      <button type="button" className="qstep-btn" onClick={() => bump(1)} aria-label={`Increase ${label}`}>
        <Icon name="plus" size={22} />
      </button>
    </div>
  );
}

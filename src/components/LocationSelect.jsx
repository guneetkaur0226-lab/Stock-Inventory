import { LOCATION_GROUPS } from '../lib/locations.js';

/** Dropdown of the predefined locations (Godown / Mayapuri Shop and their sub-locations). */
export default function LocationSelect({ id, value, onChange, blank = 'No location', exclude = '', ...rest }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} {...rest}>
      {blank !== null && <option value="">{blank}</option>}
      {LOCATION_GROUPS.map((g) => (
        <optgroup key={g.group} label={g.group}>
          {g.options
            .filter((o) => o.value !== exclude)
            .map((o) => (
              <option key={o.value} value={o.value}>
                {g.group} → {o.label}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  );
}

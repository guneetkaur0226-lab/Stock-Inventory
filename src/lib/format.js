// Indian formats: ₹ with lakh/crore grouping, DD MMM dates.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const NUM = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 });
const INR = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export const fmtNum = (n) => NUM.format(Number.isFinite(n) ? n : 0);
export const fmtINR = (n) => (Number.isFinite(n) ? INR.format(n) : '—');

const pad = (n) => String(n).padStart(2, '0');

/** "19 Oct" for this year, "19 Oct 2025" otherwise (always DD MMM). */
export function fmtDate(d, forceYear = false) {
  if (!d) return '';
  const dt = d instanceof Date ? d : d.toDate ? d.toDate() : new Date(d);
  if (isNaN(dt)) return '';
  const showYear = forceYear || dt.getFullYear() !== new Date().getFullYear();
  return `${pad(dt.getDate())} ${MONTHS[dt.getMonth()]}${showYear ? ' ' + dt.getFullYear() : ''}`;
}

export function fmtTime(d) {
  if (!d) return '';
  const dt = d instanceof Date ? d : d.toDate ? d.toDate() : new Date(d);
  if (isNaN(dt)) return '';
  let h = dt.getHours();
  const ap = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return `${pad(h)}:${pad(dt.getMinutes())} ${ap}`;
}

export const fmtDateTime = (d) => (d ? `${fmtDate(d)}, ${fmtTime(d)}` : '');

/** Full date for exports: 19 Oct 2026 */
export const fmtDateFull = (d) => fmtDate(d, true);

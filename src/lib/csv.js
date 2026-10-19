// CSV (Excel-friendly: UTF-8 with BOM) and .xlsx download helpers.

function cell(v) {
  if (v === null || v === undefined) return '';
  let s = String(v);
  // Stop spreadsheet formula injection when a text cell starts with = + @ -
  if (typeof v === 'string' && /^[=+@]/.test(s)) s = "'" + s;
  else if (typeof v === 'string' && /^-/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export const toCsv = (rows) => '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n');

export function download(filename, blobParts, type) {
  const blob = new Blob(blobParts, { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export const downloadCsv = (filename, rows) => download(filename, [toCsv(rows)], 'text/csv;charset=utf-8');

/** sheets: [{name, rows:[[...]]}] */
export async function downloadXlsx(filename, sheets) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(s.rows);
    ws['!cols'] = (s.rows[0] || []).map((h, i) => ({
      wch: Math.min(
        40,
        Math.max(String(h ?? '').length + 2, ...s.rows.slice(1, 60).map((r) => String(r[i] ?? '').length + 1))
      ),
    }));
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  download(filename, [out], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

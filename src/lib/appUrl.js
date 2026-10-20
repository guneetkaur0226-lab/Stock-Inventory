// The address staff should open. Comes from the Vercel variable APP_URL (or Vercel's production domain)
// at build time, otherwise from the address this page is open at. Not a secret.
/* global __APP_URL__ */
function clean(u) {
  let v = String(u || '').trim().replace(/\/+$/, '');
  if (!v) return '';
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
  try {
    const p = new URL(v);
    return `${p.protocol}//${p.host}`;
  } catch {
    return '';
  }
}

export function getAppUrl() {
  return clean(typeof __APP_URL__ === 'string' ? __APP_URL__ : '') || clean(window.location.origin);
}

/** Copies text to the clipboard. Falls back for browsers/WebViews without the Clipboard API. Returns true on success. */
export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the old method */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

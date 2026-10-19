import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useBackClose } from '../lib/backbutton';
import { textMatches, tokenize } from '../lib/search';

/* ---------------------------------------------------------------- icons */
const P = {
  box: 'M21 8l-9-5-9 5v8l9 5 9-5V8zM3.3 7.7L12 12.5l8.7-4.8M12 12.5V21',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  clock: 'M12 7v5l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  rupee: 'M7 5h10M7 9h10M7 5c5 0 7 2 7 4s-2 4-7 4l7 6',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  search: 'M21 21l-4.3-4.3M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z',
  x: 'M6 6l12 12M18 6L6 18',
  edit: 'M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  down: 'M12 4v12M6 12l6 6 6-6',
  up: 'M12 20V8M6 12l6-6 6 6',
  download: 'M12 4v11M7 11l5 5 5-5M5 20h14',
  upload: 'M12 16V5M7 9l5-5 5 5M5 20h14',
  users: 'M16 20v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1M9.5 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM17 11a3 3 0 100-6M21 20v-1a4 4 0 00-3-3.9',
  sun: 'M12 16a4 4 0 100-8 4 4 0 000 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  logout: 'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9',
  warn: 'M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z',
  check: 'M5 13l4 4L19 7',
  cloud: 'M18 18a4 4 0 000-8 6 6 0 00-11.7 1.5A3.5 3.5 0 007 18h11z',
  refresh: 'M20 11a8 8 0 00-14-4M4 5v4h4M4 13a8 8 0 0014 4M20 19v-4h-4',
  file: 'M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5zM14 3v5h5',
};
export function Icon({ name, size = 22, className = '' }) {
  return (
    <svg className={'ic ' + className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[name]} />
    </svg>
  );
}

/* ---------------------------------------------------------------- toast */
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [list, setList] = useState([]);
  const toast = useCallback((msg, kind = 'ok') => {
    const id = Math.random().toString(36).slice(2);
    setList((l) => [...l.slice(-2), { id, msg, kind }]);
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), kind === 'error' ? 9000 : 3200);
  }, []);
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {list.map((t) => (
          <div key={t.id} className={'toast ' + t.kind} onClick={() => setList((l) => l.filter((x) => x.id !== t.id))}>{t.msg}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------------------------------------------------------------- sheet */
export function Sheet({ title, onClose, children, footer, bare = false }) {
  useBackClose(onClose);
  useEffect(() => {
    document.body.classList.add('noscroll');
    return () => document.body.classList.remove('noscroll');
  }, []);
  return createPortal(
    <div className="backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        {bare ? children : <div className="sheet-body">{children}</div>}
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/* ---------------------------------------------------------------- fields */
export function Field({ label, error, hint, children, htmlFor }) {
  return (
    <div className={'field' + (error ? ' has-error' : '')}>
      {label && <label htmlFor={htmlFor}>{label}</label>}
      {children}
      {error ? <div className="err" role="alert">{error}</div> : hint ? <div className="hint">{hint}</div> : null}
    </div>
  );
}

/** Text input with a dropdown of suggestions (typing filters; tap to choose). */
export function Autocomplete({ value, onChange, options, placeholder, label, error, hint, onPick, maxLength = 120, inputMode }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  const tokens = tokenize(value);
  const shown = useMemo(() => {
    const list = options.filter((o) => (typeof o === 'string' ? o : o.label));
    const f = tokens.length ? list.filter((o) => textMatches(typeof o === 'string' ? o : o.label, tokens)) : list;
    return f.slice(0, 8);
  }, [options, value]); // eslint-disable-line react-hooks/exhaustive-deps
  const exact = shown.length === 1 && (typeof shown[0] === 'string' ? shown[0] : shown[0].label).toLowerCase() === value.trim().toLowerCase();
  useEffect(() => {
    const close = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  return (
    <Field label={label} error={error} hint={hint} htmlFor={id}>
      <div className="ac" ref={wrap}>
        <input id={id} value={value} maxLength={maxLength} placeholder={placeholder} inputMode={inputMode} autoComplete="off"
          onChange={(e) => { onChange(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} />
        {open && shown.length > 0 && !exact && (
          <ul className="ac-list" role="listbox">
            {shown.map((o, i) => {
              const text = typeof o === 'string' ? o : o.label;
              return (
                <li key={text + i} role="option" onPointerDown={(e) => { e.preventDefault(); onChange(text); onPick?.(o); setOpen(false); }}>
                  {text}{typeof o !== 'string' && o.sub ? <small>{o.sub}</small> : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Field>
  );
}

export function Segmented({ value, onChange, options }) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Empty({ icon = 'box', title, children }) {
  return (
    <div className="empty">
      <Icon name={icon} size={40} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

/** Two-step confirm button: first tap asks "Sure?", second tap does it. */
export function ConfirmButton({ label, confirmLabel = 'Tap again to confirm', onConfirm, className = 'btn danger', disabled }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (armed) { const t = setTimeout(() => setArmed(false), 4000); return () => clearTimeout(t); } }, [armed]);
  return (
    <button className={className + (armed ? ' armed' : '')} disabled={disabled} onClick={() => (armed ? (setArmed(false), onConfirm()) : setArmed(true))}>
      {armed ? confirmLabel : label}
    </button>
  );
}

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

// ------------------------------------------------------------------ icons
const P = {
  search: 'M11 4a7 7 0 1 0 4.2 12.6l4.6 4.6 1.4-1.4-4.6-4.6A7 7 0 0 0 11 4Zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z',
  plus: 'M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7z',
  minus: 'M4 11h16v2H4z',
  box: 'M12 2 3 6.5v11L12 22l9-4.5v-11L12 2Zm0 2.2 5.9 2.9L12 10 6.1 7.1 12 4.2ZM5 8.7l6 3v7.6l-6-3V8.7Zm14 0v7.6l-6 3v-7.6l6-3Z',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 2a7 7 0 1 1 0 14 7 7 0 0 1 0-14Zm-1 2v6l4.2 2.5.8-1.4-3.5-2.1V7h-1.5Z',
  tag: 'M3 3h8.6l9.4 9.4-8.6 8.6L3 11.6V3Zm2 2v5.8l7.4 7.4 5.8-5.8L10.8 5H5Zm3 1.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z',
  menu: 'M4 6h16v2H4V6Zm0 5h16v2H4v-2Zm0 5h16v2H4v-2Z',
  back: 'M14.7 5.3 8 12l6.7 6.7 1.4-1.4L10.8 12l5.3-5.3z',
  close: 'm6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4z',
  download: 'M11 3h2v9.2l3.3-3.3 1.4 1.4L12 16.1 6.3 10.3l1.4-1.4 3.3 3.3V3ZM5 18h14v2H5z',
  upload: 'M12 3.9l5.7 5.8-1.4 1.4L13 7.8V17h-2V7.8l-3.3 3.3-1.4-1.4L12 3.9ZM5 18h14v2H5z',
  check: 'm9.5 16.6-4.1-4.1L4 13.9l5.5 5.5L20 8.9l-1.4-1.4z',
  alert: 'M12 2 1 21h22L12 2Zm0 4.5L19.5 19h-15L12 6.5ZM11 10v4h2v-4h-2Zm0 5v2h2v-2h-2Z',
  user: 'M12 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm0 8c4.4 0 8 2 8 4.5V21H4v-2.5C4 16 7.6 14 12 14Zm0 2c-3.2 0-6 1.2-6 2.5V19h12v-.5c0-1.3-2.8-2.5-6-2.5Z',
  trash: 'M9 3h6l1 2h4v2H4V5h4l1-2Zm-3 6h12l-1 12H7L6 9Zm3 2v8h2v-8H9Zm4 0v8h2v-8h-2Z',
  edit: 'm4 16.5 9.9-9.9 3.5 3.5L7.5 20H4v-3.5Zm11.3-11.3 1.4-1.4a1.5 1.5 0 0 1 2.1 0l1.4 1.4a1.5 1.5 0 0 1 0 2.1l-1.4 1.4-3.5-3.5Z',
  sun: 'M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10ZM11 1h2v3h-2V1Zm0 19h2v3h-2v-3ZM1 11h3v2H1v-2Zm19 0h3v2h-3v-2ZM4.2 5.6l1.4-1.4 2.1 2.1-1.4 1.4-2.1-2.1Zm12.1 12.1 1.4-1.4 2.1 2.1-1.4 1.4-2.1-2.1ZM5.6 19.8l-1.4-1.4 2.1-2.1 1.4 1.4-2.1 2.1ZM17.7 7.7l-1.4-1.4 2.1-2.1 1.4 1.4-2.1 2.1Z',
  cloud: 'M7 18a5 5 0 0 1-.6-10A6.5 6.5 0 0 1 19 9.5a4.3 4.3 0 0 1-.5 8.5H7Zm0-2h11.5a2.3 2.3 0 0 0 .3-4.6l-1-.1-.1-1A4.5 4.5 0 0 0 8.3 9.3l-.2 1.1-1.1.1A3 3 0 0 0 7 16Z',
  logout: 'M10 3h9v18h-9v-2h7V5h-7V3Zm-1.5 5.5L10 10l-1 1h8v2H9l1 1-1.5 1.5L4.5 12l4-3.5Z',
  filter: 'M3 5h18l-7 8v6l-4 2v-8L3 5Z',
  rupee: 'M7 4h11v2h-3.4c.8.7 1.3 1.6 1.4 2.6H18v2h-2c-.4 2.6-2.5 4.4-5.6 4.4H9.2l7.3 5.4-1.2 1.6L6 14.8V13h4.4c1.9 0 3.1-1 3.5-2H7V9h6.8c-.3-1.2-1.4-2-3.4-2H7V4Z',
  copy: 'M8 3h10a2 2 0 0 1 2 2v11h-2V5H8V3Zm-3 4h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Zm0 2v10h10V9H5Z',
  mail: 'M3 5h18v14H3V5Zm2 2v.5l7 4.6 7-4.6V7H5Zm14 3-7 4.6L5 10v7h14v-7Z',
};
export function Icon({ name, size = 22, className = '' }) {
  return (
    <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d={P[name] || ''} />
    </svg>
  );
}

// ------------------------------------------------------------------ toast
const ToastCtx = createContext(null);
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [list, setList] = useState([]);
  const idRef = useRef(0);
  const show = useCallback((msg, kind = 'ok', ms) => {
    const id = ++idRef.current;
    setList((l) => [...l.slice(-2), { id, msg, kind }]);
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), ms || (kind === 'err' ? 9000 : 3200));
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {list.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`} onClick={() => setList((l) => l.filter((x) => x.id !== t.id))}>
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ------------------------------------------------------------ sheet / page
export function Sheet({ title, onClose, children, footer, tall }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.classList.add('noscroll');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('noscroll');
    };
  }, [onClose]);
  return (
    <div className="sheet-wrap" role="dialog" aria-modal="true" aria-label={title}>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className={`sheet ${tall ? 'tall' : ''}`}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Page({ title, onBack, children, action }) {
  return (
    <div className="page">
      <div className="page-head">
        <button className="icon-btn" onClick={onBack} aria-label="Back">
          <Icon name="back" />
        </button>
        <h1>{title}</h1>
        {action}
      </div>
      <div className="page-body">{children}</div>
    </div>
  );
}

// ------------------------------------------------------------------ confirm
const ConfirmCtx = createContext(null);
export const useConfirm = () => useContext(ConfirmCtx);
export function ConfirmProvider({ children }) {
  const [st, setSt] = useState(null);
  const ask = useCallback(
    (opts) =>
      new Promise((resolve) => {
        setSt({ ...opts, resolve });
      }),
    []
  );
  const done = (v) => {
    st.resolve(v);
    setSt(null);
  };
  return (
    <ConfirmCtx.Provider value={ask}>
      {children}
      {st && (
        <div className="sheet-wrap center" role="alertdialog" aria-modal="true">
          <div className="sheet-backdrop" onClick={() => done(false)} />
          <div className="dialog">
            <h2>{st.title}</h2>
            <p>{st.message}</p>
            <div className="row gap">
              <button className="btn" onClick={() => done(false)}>
                Cancel
              </button>
              <button className={`btn ${st.danger ? 'danger' : 'primary'}`} onClick={() => done(true)}>
                {st.okText || 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmCtx.Provider>
  );
}

// ------------------------------------------------------------------- fields
export function Field({ label, hint, error, children, htmlFor }) {
  return (
    <div className={`field ${error ? 'has-error' : ''}`}>
      {label && <label htmlFor={htmlFor}>{label}</label>}
      {children}
      {error ? <div className="err" role="alert">{error}</div> : hint ? <div className="hint">{hint}</div> : null}
    </div>
  );
}

export function Segmented({ value, onChange, options }) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          className={`${value === o.value ? 'on' : ''} ${o.cls || ''}`}
          onClick={() => onChange(o.value)}
          type="button"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Spinner({ label }) {
  return (
    <div className="center-msg">
      <div className="spinner" />
      {label && <p>{label}</p>}
    </div>
  );
}

export function Empty({ icon = 'box', title, children }) {
  return (
    <div className="center-msg empty">
      <Icon name={icon} size={40} />
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}

/** Text box that shows suggestions from `options` (browser datalist). */
export function SuggestInput({ id, value, onChange, options, ...rest }) {
  const listId = `dl-${id}`;
  return (
    <>
      <input id={id} list={listId} value={value} onChange={(e) => onChange(e.target.value)} autoComplete="off" {...rest} />
      <datalist id={listId}>
        {options.slice(0, 200).map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </>
  );
}

// Makes the Android Back button close an open sheet instead of leaving the app.
import { useEffect, useRef } from 'react';

const stack = [];
let suppress = 0;

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    if (suppress > 0) { suppress--; return; }
    const top = stack[stack.length - 1];
    if (top) { top.popped = true; top.close(); }
  });
}

export function useBackClose(onClose) {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    const entry = { popped: false, close: () => ref.current() };
    stack.push(entry);
    window.history.pushState({ sheet: stack.length }, '');
    return () => {
      const i = stack.indexOf(entry);
      if (i >= 0) stack.splice(i, 1);
      if (!entry.popped) { suppress++; window.history.back(); }
    };
  }, []);
}

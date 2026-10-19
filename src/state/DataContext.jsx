import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { slug } from '../lib/keys';

const Ctx = createContext(null);
export const useData = () => useContext(Ctx);

const read = (d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }), _pending: d.metadata.hasPendingWrites });

export function DataProvider({ profile, children }) {
  const isOwner = profile.role === 'owner';
  const [items, setItems] = useState([]);
  const [dir, setDir] = useState([]);
  const [prices, setPrices] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [accessLost, setAccessLost] = useState(false);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  useEffect(() => {
    const onErr = (e) => { if (e.code === 'permission-denied') setAccessLost(true); else console.warn(e); };
    const u1 = onSnapshot(collection(db, 'items'), { includeMetadataChanges: true }, (snap) => {
      setItems(snap.docs.map(read));
      setFromCache(snap.metadata.fromCache);
      setLoaded(true);
    }, onErr);
    const u2 = onSnapshot(collection(db, 'suppliers'), (snap) => setDir(snap.docs.map(read)), onErr);
    let u3 = () => {};
    if (isOwner) u3 = onSnapshot(collection(db, 'prices'), (snap) => setPrices(snap.docs.map(read)), onErr);
    return () => { u1(); u2(); u3(); };
  }, [isOwner]);

  const value = useMemo(() => {
    // Every supplier name we know about (for autocomplete)
    const names = new Map();
    for (const s of dir) names.set(slug(s.name), s.name);
    for (const it of items) for (const [k, h] of Object.entries(it.holders || {})) if (!names.has(k) && h?.name) names.set(k, h.name);
    for (const p of prices) if (p.supplier && !names.has(slug(p.supplier))) names.set(slug(p.supplier), p.supplier);
    const supplierNames = [...names.values()].sort((a, b) => a.localeCompare(b));
    const pending = items.filter((i) => i._pending).length;
    return { items, dir, prices, loaded, fromCache, online, accessLost, supplierNames, pending };
  }, [items, dir, prices, loaded, fromCache, online, accessLost]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

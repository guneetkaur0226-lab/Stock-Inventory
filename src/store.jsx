import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from './firebase.js';
import { useAuth } from './auth.jsx';

const Ctx = createContext(null);
export const useData = () => useContext(Ctx);

export function DataProvider({ children }) {
  const { isOwner } = useAuth();
  const [items, setItems] = useState([]);
  const [itemsReady, setItemsReady] = useState(false);
  const [suppliers, setSuppliers] = useState([]);
  const [prices, setPrices] = useState([]);
  const [pricesReady, setPricesReady] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [permError, setPermError] = useState('');

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  useEffect(() => {
    const onErr = (e) => setPermError(e.code === 'permission-denied' ? 'Access denied by the server.' : e.message);
    const u1 = onSnapshot(
      query(collection(db, 'items')),
      { includeMetadataChanges: true },
      (snap) => {
        setFromCache(snap.metadata.fromCache);
        setItems(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }), _pending: d.metadata.hasPendingWrites }))
            .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base', numeric: true }))
        );
        setItemsReady(true);
      },
      onErr
    );
    const u2 = onSnapshot(
      query(collection(db, 'suppliers')),
      (snap) => setSuppliers(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name))),
      onErr
    );
    let u3 = () => {};
    if (isOwner) {
      u3 = onSnapshot(
        query(collection(db, 'prices')),
        { includeMetadataChanges: true },
        (snap) => {
          setPrices(snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) })));
          setPricesReady(true);
        },
        onErr
      );
    }
    return () => {
      u1();
      u2();
      u3();
    };
  }, [isOwner]);

  const pending = useMemo(() => items.filter((i) => i._pending).length, [items]);

  const value = useMemo(
    () => ({ items, itemsReady, suppliers, prices, pricesReady, online, fromCache, pending, permError }),
    [items, itemsReady, suppliers, prices, pricesReady, online, fromCache, pending, permError]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

import { useState } from 'react';
import { AuthProvider, useAuth } from './auth.jsx';
import { DataProvider, useData } from './store.jsx';
import { configured } from './firebase.js';
import { ConfirmProvider, Icon, Spinner, ToastProvider } from './components/ui.jsx';
import Login from './screens/Login.jsx';
import Stock from './screens/Stock.jsx';
import History from './screens/History.jsx';
import Suppliers from './screens/Suppliers.jsx';
import More from './screens/More.jsx';

export default function App() {
  if (!configured) return <SetupNeeded />;
  return (
    <ToastProvider>
      <ConfirmProvider>
        <AuthProvider>
          <Gate />
        </AuthProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}

function SetupNeeded() {
  return (
    <div className="login">
      <h1>Almost there</h1>
      <div className="notice err">
        The Firebase settings are missing. In Vercel, open <b>Settings → Environment Variables</b>, add the six <code>VITE_FIREBASE_…</code> values from the setup guide (step 6), then redeploy.
      </div>
    </div>
  );
}

function Gate() {
  const { status, logout, fbUser, error } = useAuth();
  if (status === 'loading') return <Spinner label="Starting…" />;
  if (status === 'signedOut') return <Login />;
  if (status === 'noAccess') {
    return (
      <div className="login">
        <Icon name="alert" size={44} />
        <h1>No access</h1>
        <p>
          <b>{fbUser?.email}</b> has not been invited, or access was removed. Ask the owner to invite this email address, then sign in again.
        </p>
        {error && <div className="notice err">{error}</div>}
        <button className="btn big" onClick={logout}>Sign out</button>
      </div>
    );
  }
  return (
    <DataProvider>
      <Shell />
    </DataProvider>
  );
}

function SyncPill() {
  const { online, pending, permError } = useData();
  if (permError) return <span className="sync bad" title={permError}>⚠ Access problem</span>;
  if (!online) return <span className="sync off">Offline{pending ? ` · ${pending} waiting` : ''}</span>;
  if (pending) return <span className="sync wait">Syncing {pending}…</span>;
  return <span className="sync ok">● Synced</span>;
}

function Shell() {
  const [tab, setTab] = useState('stock');
  const tabs = [
    { id: 'stock', label: 'Stock', icon: 'box' },
    { id: 'history', label: 'History', icon: 'clock' },
    { id: 'suppliers', label: 'Suppliers', icon: 'tag' },
    { id: 'more', label: 'More', icon: 'menu' },
  ];
  const Screen = { stock: Stock, history: History, suppliers: Suppliers, more: More }[tab];
  return (
    <div className="shell">
      <header className="topbar">
        <img src="/icons/icon-192.png" alt="" width="28" height="28" />
        <h1>Mayapuri Stock</h1>
        <SyncPill />
      </header>
      <main className="content" key={tab}>
        <Screen />
      </main>
      <nav className="tabbar" aria-label="Main">
        {tabs.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
            <Icon name={t.icon} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

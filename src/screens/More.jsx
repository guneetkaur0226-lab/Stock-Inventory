import { useEffect, useState } from 'react';
import { useAuth } from '../auth.jsx';
import { useData } from '../store.jsx';
import { useTheme } from '../lib/theme.js';
import { Icon, Page, Segmented } from '../components/ui.jsx';
import Staff from './Staff.jsx';
import Import from './Import.jsx';
import Export from './Export.jsx';
import PurgeHistory from './PurgeHistory.jsx';

export default function More() {
  const { isOwner, profile, fbUser, logout } = useAuth();
  const { online, pending } = useData();
  const [theme, setTheme] = useTheme();
  const [page, setPage] = useState(null);
  const [installEvt, setInstallEvt] = useState(window.__bip || null);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

  useEffect(() => {
    const h = () => setInstallEvt(window.__bip);
    window.addEventListener('bip', h);
    return () => window.removeEventListener('bip', h);
  }, []);

  if (page) {
    const titles = { staff: 'Staff & invites', import: 'Import from Excel / CSV', export: 'Export & template', purge: 'Purge history' };
    const Body = { staff: Staff, import: Import, export: Export, purge: PurgeHistory }[page];
    return (
      <Page title={titles[page]} onBack={() => setPage(null)}>
        <Body />
      </Page>
    );
  }

  const Row = ({ icon, title, sub, onClick }) => (
    <button className="menu-row" onClick={onClick}>
      <Icon name={icon} />
      <div className="grow">
        <b>{title}</b>
        <div className="muted tiny">{sub}</div>
      </div>
      <Icon name="back" className="flip" size={18} />
    </button>
  );

  return (
    <>
      <div className="card pad person">
        <Icon name="user" size={30} />
        <div className="grow">
          <b>{profile.name}</b>
          <div className="muted tiny">{fbUser.email} · {isOwner ? 'Owner' : 'Staff'}</div>
        </div>
      </div>

      {isOwner && (
        <div className="card">
          <Row icon="user" title="Staff & invites" sub="Invite or remove staff" onClick={() => setPage('staff')} />
          <Row icon="upload" title="Import" sub="Stock, supplier prices, supplier names (.xlsx / .xls / .csv)" onClick={() => setPage('import')} />
          <Row icon="download" title="Export & template" sub="Stock, prices, history as CSV or Excel" onClick={() => setPage('export')} />
          <Row icon="trash" title="Purge history" sub="Free up storage by deleting history for a date range (owner only)" onClick={() => setPage('purge')} />
        </div>
      )}

      <div className="card pad">
        <b>Appearance</b>
        <Segmented
          value={theme}
          onChange={setTheme}
          options={[
            { value: 'auto', label: 'Auto' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
        />
      </div>

      <div className="card pad">
        <b>Connection</b>
        <p className="muted tiny">
          {online ? 'Online.' : 'Offline — you can keep working; everything is saved on this phone and sent when internet returns.'}
          {pending > 0 ? ` ${pending} item change${pending === 1 ? '' : 's'} waiting to sync.` : ' Everything is synced.'}
        </p>
        {!standalone && installEvt && (
          <button className="btn primary" onClick={async () => { installEvt.prompt(); await installEvt.userChoice; window.__bip = null; setInstallEvt(null); }}>
            Install app on this phone
          </button>
        )}
        {!standalone && !installEvt && <p className="muted tiny">To install: Chrome menu (⋮) → “Install app” or “Add to Home screen”.</p>}
      </div>

      <button className="btn big" onClick={logout}>
        <Icon name="logout" size={20} /> Sign out
      </button>
      <p className="tiny muted center">Mayapuri Stock v1.0</p>
    </>
  );
}

import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { ConfirmButton, Empty, Field, useToast } from '../ui/kit';
import { addInvite, removeInvite } from '../lib/ops';
import { fmtDate } from '../lib/format';
import { friendly } from '../lib/errors';

export default function Users({ profile }) {
  const toast = useToast();
  const [invites, setInvites] = useState([]);
  const [users, setUsers] = useState([]);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const u1 = onSnapshot(collection(db, 'invites'), (s) => setInvites(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => {});
    const u2 = onSnapshot(collection(db, 'users'), (s) => setUsers(s.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }))), () => {});
    return () => { u1(); u2(); };
  }, []);

  async function invite(e) {
    e.preventDefault();
    const em = email.trim().toLowerCase();
    if (!/^[^@\s/]+@[^@\s/]+\.[^@\s/]+$/.test(em)) { setErr('Type a full e-mail address, like rahul@gmail.com'); return; }
    if (em === profile.email) { setErr('That is your own (owner) e-mail.'); return; }
    if (invites.some((i) => i.id === em)) { setErr('This person is already invited.'); return; }
    if (name.trim().length > 100) { setErr('Name is too long.'); return; }
    setErr(''); setBusy(true);
    try {
      await addInvite(profile, em, name);
      toast(`Invited ${em}`);
      setEmail(''); setName('');
    } catch (ex) { setErr(friendly(ex)); }
    setBusy(false);
  }

  async function remove(i) {
    try { await removeInvite(i.id); toast(`Removed ${i.email}`); } catch (ex) { toast(friendly(ex), 'error'); }
  }

  const seen = (em) => users.find((u) => u.email === em);

  return (
    <div className="page-pad">
      <section className="card">
        <h2>Invite staff</h2>
        <p className="muted small">Staff can search stock, record IN/OUT, add and edit items and view history. They cannot see supplier prices, delete anything, or import/export.</p>
        <form onSubmit={invite} noValidate>
          <Field label="Name (optional)"><input value={name} maxLength={100} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rahul" /></Field>
          <Field label="Their e-mail address *" error={err} hint="They must sign in with exactly this e-mail (Google account or e-mail link).">
            <input type="email" inputMode="email" autoCapitalize="none" value={email} onChange={(e) => { setEmail(e.target.value); setErr(''); }} placeholder="name@gmail.com" />
          </Field>
          <button className="btn primary big" disabled={busy}>{busy ? 'Inviting…' : 'Invite'}</button>
        </form>
      </section>

      <section className="card">
        <h2>Staff ({invites.length})</h2>
        {invites.length === 0 && <Empty icon="users" title="No staff yet">Invite your staff above.</Empty>}
        {invites.map((i) => {
          const u = seen(i.id);
          return (
            <div key={i.id} className="staff-row">
              <div>
                <div className="pl-title">{i.name || i.email}</div>
                <div className="pl-sub">{i.name ? i.email + ' · ' : ''}{u ? `last signed in ${fmtDate(u.lastLogin)}` : 'has not signed in yet'}</div>
              </div>
              <ConfirmButton label="Remove" confirmLabel="Tap again" onConfirm={() => remove(i)} className="btn danger-ghost sm" />
            </div>
          );
        })}
        <p className="tiny muted">Removing someone cuts off their access immediately, even if their phone is offline when it next connects. Their past history entries stay.</p>
      </section>
    </div>
  );
}

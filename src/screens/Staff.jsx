import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase.js';
import { useAuth } from '../auth.jsx';
import { inviteStaff, removeStaff, sendInviteEmail } from '../db.js';
import { Field, Icon, Spinner, useConfirm, useToast } from '../components/ui.jsx';
import { fmtDate } from '../lib/format.js';
import { clean } from '../lib/text.js';

export default function Staff() {
  const auth = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [users, setUsers] = useState(null);
  const [invites, setInvites] = useState(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const u1 = onSnapshot(collection(db, 'users'), (s) => setUsers(s.docs.map((d) => ({ uid: d.id, ...d.data() }))), () => setUsers([]));
    const u2 = onSnapshot(collection(db, 'invites'), (s) => setInvites(s.docs.map((d) => ({ email: d.id, ...d.data() }))), () => setInvites([]));
    return () => {
      u1();
      u2();
    };
  }, []);

  // Emails the app link. The invite itself is already saved, so access works even if this fails.
  async function emailInvite(nm, em, saved) {
    try {
      await sendInviteEmail({ name: nm, email: em });
      toast(`${saved ? 'Invite saved and email' : 'Email'} sent to ${em}.`);
    } catch (err) {
      const link = err.appUrl || window.location.origin;
      toast(`${saved ? `Invite saved for ${nm}, but the` : 'The'} email could not be sent: ${err.message} You can send them this link yourself: ${link}`, 'err', 14000);
    }
  }

  async function invite() {
    const e = {};
    const em = email.trim().toLowerCase();
    const nm = clean(name, 100);
    if (!nm) e.name = 'Please type the staff member’s name.';
    else if (nm.length > 80) e.name = 'Name can be at most 80 characters.';
    if (!/^[^@\s/]+@[^@\s/]+\.[^@\s/]+$/.test(em)) e.email = 'Please type a valid email, like name@gmail.com';
    else if (em === auth.profile.email) e.email = 'That is your own email.';
    else if (invites?.some((i) => i.email === em)) e.email = 'This email is already invited.';
    setErrs(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      await inviteStaff({ name: nm, email: em });
      setName('');
      setEmail('');
    } catch (err) {
      toast(`Could not invite: ${err.message}`, 'err');
      setBusy(false);
      return;
    }
    await emailInvite(nm, em, true);
    setBusy(false);
  }

  async function remove(person) {
    const ok = await confirm({
      title: 'Remove this person?',
      message: `${person.name} (${person.email}) will lose access immediately. Their past history entries stay in the log.`,
      okText: 'Remove',
      danger: true,
    });
    if (!ok) return;
    try {
      await removeStaff({ uid: person.uid, email: person.email });
      toast('Access removed');
    } catch (err) {
      toast(`Could not remove: ${err.message}`, 'err');
    }
  }

  if (users === null || invites === null) return <Spinner />;
  const staff = users.filter((u) => u.role === 'staff');
  const joined = new Set(staff.map((u) => u.email));
  const waiting = invites.filter((i) => !joined.has(i.email));

  return (
    <>
      <h3 className="sec">Invite staff</h3>
      <form className="form card pad" onSubmit={(e) => { e.preventDefault(); invite(); }}>
        <Field label="Name" error={errs.name} htmlFor="st-name">
          <input id="st-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
        </Field>
        <Field label="Their Gmail / email address" error={errs.email} hint="They must sign in with this same email (Google or email link)." htmlFor="st-email">
          <input id="st-email" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <button className="btn primary big" type="submit" disabled={busy}>Send invite</button>
      </form>

      <h3 className="sec">Staff with access ({staff.length})</h3>
      {staff.length === 0 && <p className="muted">No staff have signed in yet.</p>}
      {staff.map((p) => (
        <div className="card pad person" key={p.uid}>
          <Icon name="user" />
          <div className="grow">
            <b>{p.name}</b>
            <div className="muted tiny">{p.email} · joined {fmtDate(p.createdAt?.toDate?.(), true)}</div>
          </div>
          <button className="btn danger-o" onClick={() => remove(p)}>Remove</button>
        </div>
      ))}

      {waiting.length > 0 && (
        <>
          <h3 className="sec">Invited, not signed in yet</h3>
          {waiting.map((i) => (
            <div className="card pad person" key={i.email}>
              <Icon name="mail" />
              <div className="grow">
                <b>{i.name}</b>
                <div className="muted tiny">{i.email}</div>
              </div>
              <div className="row gap">
                <button className="btn" disabled={busy} onClick={async () => { setBusy(true); await emailInvite(i.name, i.email, false); setBusy(false); }}>Resend</button>
                <button className="btn danger-o" onClick={() => remove({ ...i, uid: null })}>Cancel</button>
              </div>
            </div>
          ))}
        </>
      )}
    </>
  );
}

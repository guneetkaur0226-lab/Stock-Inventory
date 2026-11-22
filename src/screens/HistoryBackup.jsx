import { useEffect, useState } from 'react';
import { Timestamp, collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../firebase.js';
import { backupFrom, syncHistoryBackup } from '../db.js';
import { useAuth } from '../auth.jsx';
import { Empty, Spinner } from '../components/ui.jsx';
import DayCards from '../components/DayCards.jsx';

/**
 * Owner only. The last 10 days of history, kept automatically as a separate copy.
 * There is intentionally no delete or edit anywhere here, and deleting from the normal History does not change it.
 */
export default function HistoryBackup() {
  const { isOwner } = useAuth();
  const [moves, setMoves] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOwner) return undefined;
    syncHistoryBackup().catch(() => {}); // tidy up and fill in by itself
    return onSnapshot(
      query(collection(db, 'historyBackup'), where('at', '>=', Timestamp.fromDate(backupFrom())), orderBy('at', 'desc'), limit(3000)),
      (snap) => setMoves(snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }))),
      (e) => {
        setError(e.message);
        setMoves([]);
      }
    );
  }, [isOwner]);

  if (!isOwner) return <p className="muted">Only the owner can see the backup history.</p>;
  return (
    <>
      <p className="muted tiny">
        An automatic copy of the last 10 days of history. It updates by itself, older days drop off by themselves, and it cannot be edited or deleted. Deleting from the normal History does not change it.
      </p>
      {error && <div className="notice err">Could not load the backup: {error}</div>}
      {moves === null ? (
        <Spinner label="Loading backup…" />
      ) : moves.length === 0 ? (
        <Empty icon="clock" title="Nothing in the backup yet">Entries appear here automatically.</Empty>
      ) : (
        <DayCards moves={moves} />
      )}
    </>
  );
}

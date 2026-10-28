'use client';
import { useEffect, useState } from 'react';
import { creatorClient } from '../lib/creator-client';
export default function useCreatorAccount() {
  const [user, setUser] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [recovery, setRecovery] = useState(false);
  useEffect(() => {
    let live = true, subscription;
    creatorClient().then(async ({ client }) => {
      if (!live) return;
      subscription = client.auth.onAuthStateChange((event, session) => {
        if (!live) return;
        setUser(session?.user || null);
        if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      }).data.subscription;
      const { data, error: problem } = await client.auth.getUser();
      if (live) { setUser(data?.user || null); if (problem && problem.name !== 'AuthSessionMissingError') setError('Přihlaste se prosím znovu.'); setLoading(false); }
    }).catch(problem => { if (live) { setError(problem.message); setLoading(false); } });
    return () => { live = false; subscription?.unsubscribe(); };
  }, []);
  return { user, loading, error, recovery, finishRecovery: () => setRecovery(false) };
}

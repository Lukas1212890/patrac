'use client';
import { useEffect, useState } from 'react';
import { creatorClient, clearAccount } from '../lib/creator-client';
export default function useCreatorAccount() {
  const [user, setUser] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [recovery, setRecovery] = useState(false);
  useEffect(() => {
    let live = true, generation = 0;
    const params = new URLSearchParams(location.search);
    if (params.get('account') === 'recovery' && params.get('token')) setRecovery(true);
    async function refresh() {
      const version = ++generation;
      try {
        const { client } = await creatorClient();
        const { data, error: problem } = await client.getSession({ fetchOptions: { cache: 'no-store' } });
        if (!live || version !== generation) return;
        if (problem) throw Error('Přihlášení se nepodařilo ověřit.');
        setUser(data?.user?.emailVerified ? data.user : null); setError('');
      } catch (problem) { if (live && version === generation) setError(problem.message); }
      finally { if (live && version === generation) setLoading(false); }
    }
    refresh(); window.addEventListener('patrac-account-change', refresh); window.addEventListener('storage', refresh);
    return () => { live = false; window.removeEventListener('patrac-account-change', refresh); window.removeEventListener('storage', refresh); };
  }, []);
  return { user, loading, error, recovery, finishRecovery: () => { setRecovery(false); clearAccount(); history.replaceState(null, '', location.pathname); } };
}

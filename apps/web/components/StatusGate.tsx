'use client';
import { useEffect, useState } from 'react';
import { useMsal } from '@azure/msal-react';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE!;
const API_SCOPE = process.env.NEXT_PUBLIC_API_SCOPE!;

export default function StatusGate({ children }: { children: React.ReactNode }) {
  const { instance, accounts } = useMsal();
  const [status, setStatus] = useState<'unknown' | 'pending' | 'approved' | 'rejected'>('unknown');

  useEffect(() => {
    (async () => {
      if (!accounts.length) return;
      const { accessToken } = await instance.acquireTokenSilent({
        account: accounts[0],
        scopes: [API_SCOPE],
      });
      const r = await fetch(`${API_BASE}/api/users/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!r.ok) { setStatus('pending'); return; }
      const me = await r.json();
      setStatus((me.status as typeof status) || 'pending');
    })();
  }, [accounts, instance]);

  if (!accounts.length) return <>{children}</>;

  if (status === 'unknown') {
    return <p className="mt-4 text-gray-500">Checking account status…</p>;
  }
  if (status === 'pending') {
    return (
      <div className="mt-6 p-4 border rounded bg-yellow-50">
        <p className="font-medium">Your account is pending approval.</p>
        <p className="text-sm text-gray-600">You’ll get access as soon as an admin approves you.</p>
      </div>
    );
  }
  if (status === 'rejected') {
    return (
      <div className="mt-6 p-4 border rounded bg-red-50">
        <p className="font-medium">Your account was not approved.</p>
        <p className="text-sm text-gray-600">If this is unexpected, please contact support.</p>
      </div>
    );
  }
  return <>{children}</>;
}
'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '../providers';

type UserRow = {
  subject: string;
  email: string;
  display_name: string;
  status: string;
  created_at?: string;
  updated_at?: string;
};

export default function AdminPage() {
  const { msal, account, login } = useAuth();
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [error, setError] = useState<string>('');
  const [users, setUsers] = useState<UserRow[]>([]);

  useEffect(() => {
    if (!msal || !account) return;

    const run = async () => {
      try {
        setStatus('loading');
        setError('');

        const scope = process.env.NEXT_PUBLIC_API_SCOPE!;
        const base = process.env.NEXT_PUBLIC_API_BASE!;
        const token = await msal.acquireTokenSilent({ account, scopes: [scope] });

        const res = await fetch(`${base}/api/admin/users?status=pending`, {
          headers: { Authorization: `Bearer ${token.accessToken}` },
        });

        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const data = await res.json();
        setUsers(Array.isArray(data.users) ? data.users : data);
        setStatus('ok');
      } catch (e) {
        setError((e as Error).message);
        setStatus('error');
      }
    };

    void run();
  }, [msal, account]);

  if (!account) {
    return (
      <main className="p-6 space-y-4">
        <h1 className="text-2xl font-bold">Admin</h1>
        <p>You must sign in to view this page.</p>
        <button className="px-3 py-2 rounded bg-blue-600 text-white" onClick={login}>
          Sign in
        </button>
      </main>
    );
  }

  return (
    <main className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Users: pending</h1>

      {status === 'loading' && <p>Loading…</p>}
      {status === 'error' && <p className="text-red-600">Error: {error}</p>}
      {status === 'ok' && users.length === 0 && <p>No users found.</p>}

      {users.length > 0 && (
        <ul className="list-disc pl-6">
          {users.map((u) => (
            <li key={u.subject}>
              {u.display_name} — {u.email} <em>({u.status})</em>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
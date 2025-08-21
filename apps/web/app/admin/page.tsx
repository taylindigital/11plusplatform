'use client';

import { useEffect, useMemo, useState } from 'react';

type ApiUser = {
  subject: string;
  email: string;
  display_name: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  updated_at: string;
};

declare global {
  interface Window {
    msalInstance?: any;
  }
}

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [error, setError] = useState<string>('');

  const apiBase = useMemo(
    () => process.env.NEXT_PUBLIC_API_BASE || '',
    []
  );
  const scope = useMemo(
    () => process.env.NEXT_PUBLIC_API_SCOPE || '',
    []
  );
  const adminEmail = useMemo(
    () => (process.env.NEXT_PUBLIC_ADMIN_EMAIL || '').toLowerCase(),
    []
  );

  const getAccessToken = async (): Promise<string> => {
    const msal = window.msalInstance;
    if (!msal) throw new Error('MSAL not available');

    const accounts = msal.getAllAccounts?.() || [];
    if (!accounts.length) throw new Error('No MSAL account found');

    const account = accounts[0];
    if (!scope) throw new Error('NEXT_PUBLIC_API_SCOPE is missing');

    const result = await msal.acquireTokenSilent({
      account,
      scopes: [scope],
    });

    if (!result?.accessToken) throw new Error('No accessToken returned');
    return result.accessToken as string;
  };

  const fetchPending = async () => {
    setLoading(true);
    setError('');
    try {
      const token = await getAccessToken();

      // (Optional) sanity check: whoami
      try {
        await fetch(`${apiBase}/debug/whoami`, {
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // ignore if 401 here; main call below will tell us more
      }

      const res = await fetch(`${apiBase}/api/admin/users?status=pending`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });

      if (res.status === 401) throw new Error('Unauthorized (401). Are you logged in?');
      if (res.status === 403) throw new Error('Forbidden (403). This user is not the ADMIN.');
      if (!res.ok) throw new Error(`API error: ${res.status}`);

      const data = await res.json();
      // Our API returns { ok: true, users: [...] }
      setUsers(Array.isArray(data?.users) ? data.users : data);
    } catch (e) {
      setError((e as Error).message || String(e));
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Admin</h1>

      <div className="mb-4 text-sm">
        <div><strong>Admin email (env):</strong> {adminEmail || '(not set)'}</div>
        <div><strong>API base:</strong> {apiBase}</div>
        <div><strong>Scope:</strong> {scope}</div>
      </div>

      <button
        className="px-3 py-2 rounded bg-gray-100 border mb-4"
        onClick={fetchPending}
      >
        Refresh
      </button>

      {loading && <p>Loading…</p>}
      {error && <p className="text-red-600">Error: {error}</p>}

      {!loading && !error && (
        <div className="space-y-2">
          {users.length === 0 ? (
            <p>No pending users.</p>
          ) : (
            users.map((u) => (
              <div key={u.subject} className="border rounded p-3">
                <div><strong>{u.display_name || '(no name)'}</strong></div>
                <div className="text-sm text-gray-600">{u.email}</div>
                <div className="text-sm">Status: {u.status}</div>
                <div className="mt-2 flex gap-2">
                  <ApproveButton subject={u.subject} onDone={fetchPending} />
                  <RejectButton subject={u.subject} onDone={fetchPending} />
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </main>
  );
}

function ApproveButton({ subject, onDone }: { subject: string; onDone: () => void }) {
  const apiBase = process.env.NEXT_PUBLIC_API_BASE || '';
  const scope = process.env.NEXT_PUBLIC_API_SCOPE || '';

  const doApprove = async () => {
    const msal = window.msalInstance;
    const account = msal?.getAllAccounts?.()[0];
    const { accessToken } = await msal.acquireTokenSilent({ account, scopes: [scope] });
    await fetch(`${apiBase}/api/admin/users/${encodeURIComponent(subject)}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    onDone();
  };

  return (
    <button className="px-2 py-1 rounded bg-emerald-600 text-white" onClick={doApprove}>
      Approve
    </button>
  );
}

function RejectButton({ subject, onDone }: { subject: string; onDone: () => void }) {
  const apiBase = process.env.NEXT_PUBLIC_API_BASE || '';
  const scope = process.env.NEXT_PUBLIC_API_SCOPE || '';

  const doReject = async () => {
    const msal = window.msalInstance;
    const account = msal?.getAllAccounts?.()[0];
    const { accessToken } = await msal.acquireTokenSilent({ account, scopes: [scope] });
    await fetch(`${apiBase}/api/admin/users/${encodeURIComponent(subject)}/reject`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    onDone();
  };

  return (
    <button className="px-2 py-1 rounded bg-red-600 text-white" onClick={doReject}>
      Reject
    </button>
  );
}
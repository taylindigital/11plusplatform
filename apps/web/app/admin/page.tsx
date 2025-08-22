'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AccountInfo, PublicClientApplication } from '@azure/msal-browser';

type User = {
  subject: string;
  email: string;
  display_name: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at?: string;
  updated_at?: string;
};

type ApiUsersResponse =
  | { ok: true; users: User[] }
  | { ok: false; error: string };

type ApiSimpleOk = { ok: true } | { ok: false; error: string };

// ---- helpers

const toMessage = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return 'Unknown error';
  }
};

declare global {
  interface Window {
    // __env is declared globally elsewhere as Record<string, string> | undefined
    // so don't narrow it here — just add msalInstance (same type as global.d.ts)
    msalInstance?: PublicClientApplication;
  }
}

function getEnvString(key: string, fallback = ''): string {
  if (typeof window !== 'undefined' && window.__env && typeof window.__env[key] === 'string') {
    return window.__env[key] as string;
  }
  return fallback;
}

async function getApiToken(scope: string): Promise<string> {
  const msal = window.msalInstance;
  if (!msal) throw new Error('MSAL not initialised');
  const accounts: AccountInfo[] = msal.getAllAccounts();
  const account = accounts[0];
  if (!account) throw new Error('No MSAL account (not signed in?)');

  const { accessToken } = await msal.acquireTokenSilent({
    account,
    scopes: [scope],
  });
  return accessToken;
}

// ---- component

export default function AdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected' | ''>('pending');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const apiBase = useMemo(
    () => getEnvString('NEXT_PUBLIC_API_BASE', ''),
    [],
  );
  const scope = useMemo(
    () => getEnvString('NEXT_PUBLIC_API_SCOPE', ''),
    [],
  );
  const adminEmail = useMemo(
    () => getEnvString('NEXT_PUBLIC_ADMIN_EMAIL', ''),
    [],
  );

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!apiBase) throw new Error('API base missing');
      if (!scope) throw new Error('API scope missing');

      const token = await getApiToken(scope);
      const url = new URL('/api/admin/users', apiBase);
      if (statusFilter) url.searchParams.set('status', statusFilter);

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const bodyText = await res.text().catch(() => '');
        throw new Error(`Fetch users failed (${res.status}): ${bodyText || res.statusText}`);
      }

      const data: ApiUsersResponse = await res.json();
      if (!('ok' in data) || !data.ok) {
        throw new Error(data?.error || 'Unknown API error');
      }

      setUsers(data.users);
    } catch (e) {
      setError(toMessage(e));
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [apiBase, scope, statusFilter]);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  const approve = useCallback(
    async (subject: string) => {
      setError(null);
      try {
        if (!apiBase) throw new Error('API base missing');
        if (!scope) throw new Error('API scope missing');
        const token = await getApiToken(scope);

        const res = await fetch(`${apiBase}/api/admin/users/${encodeURIComponent(subject)}/approve`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          const bodyText = await res.text().catch(() => '');
          throw new Error(`Approve failed (${res.status}): ${bodyText || res.statusText}`);
        }

        const data: ApiSimpleOk = await res.json();
        if (!('ok' in data) || !data.ok) {
          throw new Error(data?.error || 'Approve failed');
        }

        // refresh
        void fetchUsers();
      } catch (e) {
        setError(toMessage(e));
      }
    },
    [apiBase, scope, fetchUsers],
  );

  const reject = useCallback(
    async (subject: string) => {
      setError(null);
      try {
        if (!apiBase) throw new Error('API base missing');
        if (!scope) throw new Error('API scope missing');
        const token = await getApiToken(scope);

        const res = await fetch(`${apiBase}/api/admin/users/${encodeURIComponent(subject)}/reject`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          const bodyText = await res.text().catch(() => '');
          throw new Error(`Reject failed (${res.status}): ${bodyText || res.statusText}`);
        }

        const data: ApiSimpleOk = await res.json();
        if (!('ok' in data) || !data.ok) {
          throw new Error(data?.error || 'Reject failed');
        }

        // refresh
        void fetchUsers();
      } catch (e) {
        setError(toMessage(e));
      }
    },
    [apiBase, scope, fetchUsers],
  );

  return (
    <main className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-bold">Admin</h1>

      <div className="mt-2 text-sm text-gray-600">
        <div><strong>Admin email (env):</strong> {adminEmail || '(not set)'}</div>
        <div><strong>API base:</strong> {apiBase || '(missing)'}</div>
        <div><strong>Scope:</strong> {scope || '(missing)'}</div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <label className="text-sm">Filter:</label>
        <select
          className="border rounded px-2 py-1"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
        >
          <option value="">All</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>

        <button
          className="ml-2 px-3 py-1 rounded border"
          onClick={() => void fetchUsers()}
          disabled={loading}
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="mt-3 p-3 rounded bg-red-100 text-red-800">
          {error}
        </div>
      )}

      {loading ? (
        <p className="mt-4">Loading…</p>
      ) : users.length === 0 ? (
        <p className="mt-4">No users.</p>
      ) : (
        <table className="mt-4 w-full text-sm border">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="p-2 border">Email</th>
              <th className="p-2 border">Name</th>
              <th className="p-2 border">Status</th>
              <th className="p-2 border w-48">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.subject}>
                <td className="p-2 border">{u.email}</td>
                <td className="p-2 border">{u.display_name}</td>
                <td className="p-2 border">{u.status}</td>
                <td className="p-2 border">
                  <div className="flex gap-2">
                    <button
                      className="px-2 py-1 rounded border"
                      onClick={() => void approve(u.subject)}
                      disabled={loading || u.status === 'approved'}
                      title="Approve"
                    >
                      Approve
                    </button>
                    <button
                      className="px-2 py-1 rounded border"
                      onClick={() => void reject(u.subject)}
                      disabled={loading || u.status === 'rejected'}
                      title="Reject"
                    >
                      Reject
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
'use client';

import React, { useCallback, useMemo, useState } from 'react';
import type { AccountInfo } from '@azure/msal-browser';

/** Adjust these if you change env var names */
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';
const API_SCOPE =
  process.env.NEXT_PUBLIC_API_SCOPE ||
  'api://86e5f581-3f41-4b24-a7a1-3a987016f841/access_as_user';
const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL || '';

type AppUser = {
  subject: string;
  email: string;
  display_name: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at?: string;
  updated_at?: string;
};

type UsersResponse = { ok: true; users: AppUser[] } | { ok?: false; error?: string };

/** Get an API token from MSAL on the client */
async function getApiToken(scope: string): Promise<string> {
  // Avoid top-level "window" — only touch it in functions inside the client component
  const msal = (window as any).msalInstance as
    | {
        getAllAccounts: () => AccountInfo[];
        acquireTokenSilent: (args: { account: AccountInfo; scopes: string[] }) => Promise<{
          accessToken: string;
        }>;
      }
    | undefined;

  if (!msal) throw new Error('MSAL instance missing on window (are you logged in?)');

  const account = msal.getAllAccounts()[0];
  if (!account) throw new Error('No MSAL account found (are you signed in?)');

  const { accessToken } = await msal.acquireTokenSilent({
    account,
    scopes: [scope],
  });

  return accessToken;
}

export default function AdminPage(): React.ReactElement{
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [debug, setDebug] = useState<Record<string, unknown> | null>(null);

  const headers = useMemo(() => {
    return {
      json: { 'Content-Type': 'application/json' },
    };
  }, []);

  const fetchPending = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const token = await getApiToken(API_SCOPE);
      const res = await fetch(`${API_BASE}/api/admin/users?status=pending`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: 'no-store',
      });

      // Helpful debug info for 403/401
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        setError(`Load failed: ${res.status} ${res.statusText} ${text}`);
        setUsers([]);
        return;
      }

      const data: UsersResponse = await res.json();
      if ('ok' in data && data.ok) {
        setUsers(data.users);
      } else {
        setError((data as any).error || 'Unknown error');
      }
    } catch (e: any) {
      setError(e?.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const approve = useCallback(async (subject: string) => {
    setLoading(true);
    setError(null);
    try {
      const token = await getApiToken(API_SCOPE);
      const res = await fetch(`${API_BASE}/api/admin/users/${encodeURIComponent(subject)}/approve`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          ...headers.json,
        },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Approve failed: ${res.status} ${text}`);
      }
      await fetchPending();
    } catch (e: any) {
      setError(e?.message || 'Approve failed');
    } finally {
      setLoading(false);
    }
  }, [fetchPending, headers.json]);

  const reject = useCallback(async (subject: string) => {
    setLoading(true);
    setError(null);
    try {
      const token = await getApiToken(API_SCOPE);
      const res = await fetch(`${API_BASE}/api/admin/users/${encodeURIComponent(subject)}/reject`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          ...headers.json,
        },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Reject failed: ${res.status} ${text}`);
      }
      await fetchPending();
    } catch (e: any) {
      setError(e?.message || 'Reject failed');
    } finally {
      setLoading(false);
    }
  }, [fetchPending, headers.json]);

  const whoAmI = useCallback(async () => {
    setError(null);
    setDebug(null);
    try {
      const token = await getApiToken(API_SCOPE);
      const res = await fetch(`${API_BASE}/debug/whoami`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));
      setDebug(data);
    } catch (e: any) {
      setError(e?.message || 'Failed to fetch whoami');
    }
  }, []);

  return (
    <main className="max-w-3xl mx-auto p-6">
      <h1 className="text-3xl font-bold">Admin</h1>
      <p className="text-sm text-gray-600 mt-1">
        Admin email (env): <code>{ADMIN_EMAIL || '(not set)'}</code>
      </p>
      <p className="text-sm text-gray-600">
        API base: <code>{API_BASE || '(not set)'}</code>
      </p>
      <p className="text-sm text-gray-600">
        Scope: <code>{API_SCOPE || '(not set)'}</code>
      </p>

      <div className="mt-4 flex gap-2">
        <button
          className="px-3 py-2 rounded bg-emerald-600 text-white disabled:opacity-50"
          onClick={fetchPending}
          disabled={loading}
        >
          {loading ? 'Loading…' : 'Load pending users'}
        </button>
        <button
          className="px-3 py-2 rounded bg-slate-700 text-white disabled:opacity-50"
          onClick={whoAmI}
          disabled={loading}
        >
          Who am I? (debug)
        </button>
      </div>

      {error && (
        <div className="mt-4 p-3 rounded border border-red-300 bg-red-50 text-red-700">
          {error}
        </div>
      )}

      {debug && (
        <details className="mt-4 p-3 rounded border">
          <summary className="cursor-pointer">Debug: /debug/whoami</summary>
          <pre className="text-xs overflow-auto">{JSON.stringify(debug, null, 2)}</pre>
        </details>
      )}

      <div className="mt-6">
        {users.length === 0 ? (
          <p className="text-gray-600">No pending users yet. Click “Load pending users”.</p>
        ) : (
          <ul className="space-y-3">
            {users.map((u) => (
              <li key={u.subject} className="p-3 rounded border">
                <div className="font-medium">{u.display_name || u.email}</div>
                <div className="text-sm text-gray-600">{u.email}</div>
                <div className="text-xs text-gray-500">status: {u.status}</div>

                <div className="mt-2 flex gap-2">
                  <button
                    className="px-3 py-1 rounded bg-emerald-600 text-white"
                    onClick={() => approve(u.subject)}
                    disabled={loading}
                  >
                    Approve
                  </button>
                  <button
                    className="px-3 py-1 rounded bg-rose-600 text-white"
                    onClick={() => reject(u.subject)}
                    disabled={loading}
                  >
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
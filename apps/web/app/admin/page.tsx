// apps/web/app/admin/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { AccountInfo } from '@azure/msal-browser';

// Types for what the API returns
type AdminUser = {
  subject: string;
  email: string;
  display_name: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  updated_at: string;
};

type UsersResponse =
  | { ok: true; users: AdminUser[] }
  | { ok?: false; error?: string };

function useEnv() {
  // Read env exposed to the client (from SWA App Settings)
  const apiBase =
    window?.__env?.NEXT_PUBLIC_API_BASE ||
    process.env.NEXT_PUBLIC_API_BASE ||
    '';

  const adminEmail =
    window?.__env?.NEXT_PUBLIC_ADMIN_EMAIL ||
    process.env.NEXT_PUBLIC_ADMIN_EMAIL ||
    '';

  const scope =
    window?.__env?.NEXT_PUBLIC_API_SCOPE ||
    process.env.NEXT_PUBLIC_API_SCOPE ||
    '';

  return { apiBase, adminEmail, scope };
}

async function getApiToken(scope: string): Promise<string> {
  const msal = window.msalInstance;
  if (!msal) throw new Error('MSAL instance missing on window');

  const account = msal.getAllAccounts()[0] as AccountInfo | undefined;
  if (!account) throw new Error('No MSAL account found (are you signed in?)');

  const { accessToken } = await msal.acquireTokenSilent({
    account,
    scopes: [scope],
  });
  return accessToken;
}

export default function AdminPage() {
  const { apiBase, adminEmail, scope } = useEnv();

  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [errMsg, setErrMsg] = useState<string>('');
  const [actionBusy, setActionBusy] = useState<string>(''); // subject currently being updated

  const headersMemo = useMemo(() => ({ 'Content-Type': 'application/json' }), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setErrMsg('');

        if (!apiBase || !scope) {
          throw new Error('Missing API base or scope');
        }

        const token = await getApiToken(scope);
        const res = await fetch(`${apiBase}/api/admin/users?status=pending`, {
          headers: { ...headersMemo, Authorization: `Bearer ${token}` },
          mode: 'cors',
        });

        if (res.status === 403) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data?.error || 'Forbidden (not admin)');
        }
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Failed to load users (${res.status}): ${text}`);
        }

        const data = (await res.json()) as UsersResponse;
        if (!('ok' in data) || !data.ok) {
          throw new Error((data as { error?: string }).error || 'Unknown error');
        }

        if (!cancelled) setUsers(data.users);
      } catch (e) {
        if (!cancelled) setErrMsg((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [apiBase, scope, headersMemo]);

  async function doAction(subject: string, action: 'approve' | 'reject') {
    try {
      setActionBusy(subject);
      setErrMsg('');

      const token = await getApiToken(scope);
      const res = await fetch(`${apiBase}/api/admin/users/${encodeURIComponent(subject)}/${action}`, {
        method: 'POST',
        headers: { ...headersMemo, Authorization: `Bearer ${token}` },
        mode: 'cors',
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`${action} failed (${res.status}): ${text}`);
      }

      // Optimistically remove from list (or you can re-fetch)
      setUsers(prev => prev.filter(u => u.subject !== subject));
    } catch (e) {
      setErrMsg((e as Error).message);
    } finally {
      setActionBusy('');
    }
  }

  return (
    <main className="max-w-3xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Admin</h1>
        <p className="text-sm text-gray-600">
          Admin email (env): <span className="font-mono">{adminEmail || '—'}</span>
        </p>
        <p className="text-sm text-gray-600">
          API base: <span className="font-mono">{apiBase || '—'}</span>
        </p>
        <p className="text-sm text-gray-600">
          Scope: <span className="font-mono">{scope || '—'}</span>
        </p>
        <p className="mt-2">
          <Link href="/" className="underline">Back to home</Link>
        </p>
      </div>

      {loading && <p>Loading…</p>}
      {errMsg && (
        <div className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-red-800">
          {errMsg}
        </div>
      )}

      {!loading && !errMsg && users.length === 0 && (
        <p className="text-gray-700">No pending users 🎉</p>
      )}

      <ul className="space-y-3">
        {users.map(u => (
          <li key={u.subject} className="rounded border p-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <div className="font-medium">{u.display_name || '—'}</div>
                <div className="text-sm text-gray-600">{u.email}</div>
                <div className="text-xs text-gray-500">
                  status: {u.status} • created: {new Date(u.created_at).toLocaleString()}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  className="px-3 py-1 rounded bg-emerald-600 text-white disabled:opacity-50"
                  onClick={() => doAction(u.subject, 'approve')}
                  disabled={!!actionBusy}
                >
                  {actionBusy === u.subject ? '…' : 'Approve'}
                </button>
                <button
                  className="px-3 py-1 rounded bg-rose-600 text-white disabled:opacity-50"
                  onClick={() => doAction(u.subject, 'reject')}
                  disabled={!!actionBusy}
                >
                  {actionBusy === u.subject ? '…' : 'Reject'}
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
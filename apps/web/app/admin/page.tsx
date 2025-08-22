'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { PublicClientApplication, AccountInfo } from '@azure/msal-browser';

// ---------- Types ----------
type UserRow = {
  subject: string;
  email: string;
  display_name: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at?: string;
  updated_at?: string;
};

type UsersResponse =
  | { ok: true; users: UserRow[] }
  | { ok: false; error: string };

interface WindowWithMsal extends Window {
  msalInstance?: PublicClientApplication;
  __env?: Record<string, string>;
}

// ---------- Helpers ----------
function readEnv(key: string, fallback = ''): string {
  if (typeof window !== 'undefined') {
    const env = (window as WindowWithMsal).__env;
    if (env && typeof env[key] === 'string') return env[key]!;
  }
  const val = (process.env as Record<string, string | undefined>)[key];
  return typeof val === 'string' ? val : fallback;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : 'Unknown error';
}

// ---------- Component ----------
export default function AdminPage(): React.ReactElement {
  const API_BASE = useMemo(() => readEnv('NEXT_PUBLIC_API_BASE', ''), []);
  const SCOPE = useMemo(() => readEnv('NEXT_PUBLIC_API_SCOPE', ''), []);
  const ADMIN_EMAIL = useMemo(() => readEnv('NEXT_PUBLIC_ADMIN_EMAIL', ''), []);

  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  // Fetch users
  const fetchUsers = async () => {
    setError('');
    setLoading(true);
    try {
      if (!API_BASE) throw new Error('API base missing');
      if (!SCOPE) throw new Error('API scope missing');

      const msal = (window as WindowWithMsal).msalInstance;
      if (!msal) throw new Error('MSAL not initialized (are you signed in?)');

      const account: AccountInfo | undefined = msal.getAllAccounts()[0];
      if (!account) throw new Error('No MSAL account found');

      const { accessToken } = await msal.acquireTokenSilent({
        account,
        scopes: [SCOPE],
      });

      const res = await fetch(`${API_BASE}/api/admin/users?status=${encodeURIComponent(statusFilter)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (res.status === 403) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body?.error === 'forbidden_not_admin'
            ? 'Forbidden: this user is not the ADMIN'
            : `Forbidden (403)`
        );
      }
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);

      const data: UsersResponse = await res.json();
      if (!data.ok) throw new Error(data.error);
      setRows(data.users);
    } catch (e) {
      setError(errMsg(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  // Approve / reject
  const updateStatus = async (subject: string, action: 'approve' | 'reject') => {
    setError('');
    try {
      if (!API_BASE) throw new Error('API base missing');
      if (!SCOPE) throw new Error('API scope missing');

      const msal = (window as WindowWithMsal).msalInstance;
      if (!msal) throw new Error('MSAL not initialized');

      const account: AccountInfo | undefined = msal.getAllAccounts()[0];
      if (!account) throw new Error('No MSAL account found');

      const { accessToken } = await msal.acquireTokenSilent({
        account,
        scopes: [SCOPE],
      });

      const res = await fetch(
        `${API_BASE}/api/admin/users/${encodeURIComponent(subject)}/${action}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`Action failed (${res.status}): ${txt || res.statusText}`);
      }

      await fetchUsers();
    } catch (e) {
      setError(errMsg(e));
    }
  };

  useEffect(() => {
    void fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">Admin</h1>

      <div className="rounded border p-4 text-sm">
        <div>
          <strong>Admin email (env):</strong>{' '}
          {ADMIN_EMAIL || <span className="text-red-600">(not set)</span>}
        </div>
        <div>
          <strong>API base:</strong>{' '}
          {API_BASE ? API_BASE : <span className="text-red-600">(missing)</span>}
        </div>
        <div>
          <strong>Scope:</strong>{' '}
          {SCOPE ? SCOPE : <span className="text-red-600">(missing)</span>}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <label className="text-sm">Filter:</label>
        <select
          className="border rounded px-2 py-1"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
        >
          <option value="pending">pending</option>
          <option value="approved">approved</option>
          <option value="rejected">rejected</option>
        </select>
        <button
          onClick={() => void fetchUsers()}
          className="px-3 py-1 rounded bg-slate-700 text-white"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="p-3 rounded border border-red-300 bg-red-50 text-red-700 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div>Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-sm">No users.</div>
      ) : (
        <div className="space-y-3">
          {rows.map((u) => (
            <div key={u.subject} className="border rounded p-3 flex flex-col gap-1">
              <div className="font-medium">{u.display_name || '(no name)'}</div>
              <div className="text-sm text-gray-600">{u.email}</div>
              <div className="text-xs">status: {u.status}</div>
              <div className="flex gap-2 mt-2">
                <button
                  className="px-3 py-1 rounded bg-emerald-600 text-white"
                  onClick={() => void updateStatus(u.subject, 'approve')}
                >
                  Approve
                </button>
                <button
                  className="px-3 py-1 rounded bg-rose-600 text-white"
                  onClick={() => void updateStatus(u.subject, 'reject')}
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
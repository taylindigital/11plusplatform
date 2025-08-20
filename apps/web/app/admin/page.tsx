'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useMsal } from '@azure/msal-react';
import { useIsAdmin } from '@/lib/useIsAdmin';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE!;
const API_SCOPE = process.env.NEXT_PUBLIC_API_SCOPE!;

type UserRow = {
  subject: string;
  email: string;
  display_name: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  updated_at: string;
};

export default function AdminPage() {
  const isAdmin = useIsAdmin();
  const { instance, accounts } = useMsal();
  const [statusFilter, setStatusFilter] = useState<'all'|'pending'|'approved'|'rejected'>('pending');
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    if (!isAdmin || !accounts.length) return;
    setLoading(true); setErr(null);
    try {
      const { accessToken } = await instance.acquireTokenSilent({
        account: accounts[0],
        scopes: [API_SCOPE],
      });
      const qs = statusFilter === 'all' ? '' : `?status=${encodeURIComponent(statusFilter)}`;
      const r = await fetch(`${API_BASE}/api/admin/users${qs}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
      const data = (await r.json()) as UserRow[];
      setRows(data);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, accounts, instance, statusFilter]);

  const act = useCallback(async (subject: string, action: 'approve'|'reject') => {
    setErr(null);
    try {
      const { accessToken } = await instance.acquireTokenSilent({
        account: accounts[0],
        scopes: [API_SCOPE],
      });
      const r = await fetch(`${API_BASE}/api/admin/users/${encodeURIComponent(subject)}/${action}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
      await fetchUsers();
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [accounts, instance, fetchUsers]);

  useEffect(() => { void fetchUsers(); }, [fetchUsers]);

  const title = useMemo(
    () => (statusFilter === 'all' ? 'All users' : `Users: ${statusFilter}`),
    [statusFilter]
  );

  if (!isAdmin) {
    return (
      <div className="max-w-3xl mx-auto mt-10 p-6 border rounded">
        <h1 className="text-xl font-semibold mb-2">Admin</h1>
        <p className="text-sm text-gray-600">You don’t have access to this page.</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto mt-8 p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">{title}</h1>
        <div className="flex items-center gap-2">
          <label className="text-sm">Filter:</label>
          <select
            className="border rounded px-2 py-1"
            value={statusFilter}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
              setStatusFilter(e.target.value as typeof statusFilter)
            }
          >
            <option value="pending">pending</option>
            <option value="approved">approved</option>
            <option value="rejected">rejected</option>
            <option value="all">all</option>
          </select>
          <button className="px-3 py-1 rounded border" onClick={() => void fetchUsers()}>
            Refresh
          </button>
        </div>
      </div>

      {err && <div className="mb-3 text-red-600 text-sm">Error: {err}</div>}
      {loading && <div className="text-gray-500 text-sm">Loading…</div>}

      {!loading && rows.length === 0 && (
        <p className="text-gray-600 text-sm">No users found.</p>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto border rounded">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-3 py-2">email</th>
                <th className="text-left px-3 py-2">name</th>
                <th className="text-left px-3 py-2">status</th>
                <th className="text-left px-3 py-2">created</th>
                <th className="text-left px-3 py-2">updated</th>
                <th className="text-left px-3 py-2">actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.subject} className="border-t">
                  <td className="px-3 py-2">{u.email}</td>
                  <td className="px-3 py-2">{u.display_name || '-'}</td>
                  <td className="px-3 py-2">{u.status}</td>
                  <td className="px-3 py-2">{new Date(u.created_at).toLocaleString()}</td>
                  <td className="px-3 py-2">{new Date(u.updated_at).toLocaleString()}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <button
                        className="px-2 py-1 rounded bg-emerald-600 text-white disabled:opacity-50"
                        disabled={u.status === 'approved'}
                        onClick={() => void act(u.subject, 'approve')}
                      >Approve</button>
                      <button
                        className="px-2 py-1 rounded bg-rose-600 text-white disabled:opacity-50"
                        disabled={u.status === 'rejected'}
                        onClick={() => void act(u.subject, 'reject')}
                      >Reject</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
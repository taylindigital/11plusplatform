'use client';

import { useEffect, useState } from 'react';
import { useMsal } from '@azure/msal-react';
import { InteractionRequiredAuthError } from '@azure/msal-browser';

type UserRow = {
  id: string;
  email: string;
  display_name: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  updated_at: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'https://app-11plusplatform-dev-uks.azurewebsites.net';

export default function AdminPage() {
  const { instance, accounts } = useMsal();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all'|'pending'|'approved'|'rejected'>('pending');
  const [error, setError] = useState<string | null>(null);

  async function getToken() {
    const account = accounts[0];
    if (!account) throw new Error('No account');
    try {
      const res = await instance.acquireTokenSilent({
        account,
        scopes: [process.env.NEXT_PUBLIC_API_SCOPE!],
      });
      return res.accessToken;
    } catch (e) {
      if (e instanceof InteractionRequiredAuthError) {
        const res = await instance.acquireTokenRedirect({
          account,
          scopes: [process.env.NEXT_PUBLIC_API_SCOPE!],
        });
        return res.accessToken;
      }
      throw e;
    }
  }

  async function loadUsers() {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const qs = filter === 'all' ? '' : `?status=${filter}`;
      const resp = await fetch(`${API_BASE}/admin/users${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || 'Failed to load');
      setUsers(data.users);
    } catch (e: any) {
      setError(e.message || 'Error');
    } finally {
      setLoading(false);
    }
  }

  async function mutate(id: string, action: 'approve'|'reject') {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const resp = await fetch(`${API_BASE}/admin/users/${id}/${action}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) {
        const d = await resp.json().catch(() => ({}));
        throw new Error(d?.error || 'Failed action');
      }
      await loadUsers();
    } catch (e: any) {
      setError(e.message || 'Error');
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  return (
    <main className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-4">Admin — User approvals</h1>

      <div className="flex items-center gap-2 mb-4">
        <label className="text-sm">Filter:</label>
        <select
          className="border rounded px-2 py-1 text-sm"
          value={filter}
          onChange={(e) => setFilter(e.target.value as any)}
        >
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="all">All</option>
        </select>
        <button
          className="ml-auto border rounded px-3 py-1 text-sm"
          onClick={() => loadUsers()}
          disabled={loading}
        >
          Refresh
        </button>
      </div>

      {error && <p className="text-red-600 text-sm mb-2">Error: {error}</p>}
      {loading && <p className="text-sm">Loading…</p>}

      <table className="w-full text-sm border">
        <thead>
          <tr className="bg-gray-50">
            <th className="p-2 text-left">Email</th>
            <th className="p-2 text-left">Name</th>
            <th className="p-2 text-left">Status</th>
            <th className="p-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-t">
              <td className="p-2">{u.email}</td>
              <td className="p-2">{u.display_name ?? '—'}</td>
              <td className="p-2">{u.status}</td>
              <td className="p-2 text-right">
                <button
                  className="mr-2 border rounded px-2 py-1"
                  disabled={u.status === 'approved' || loading}
                  onClick={() => mutate(u.id, 'approve')}
                >
                  Approve
                </button>
                <button
                  className="border rounded px-2 py-1"
                  disabled={u.status === 'rejected' || loading}
                  onClick={() => mutate(u.id, 'reject')}
                >
                  Reject
                </button>
              </td>
            </tr>
          ))}
          {users.length === 0 && !loading && (
            <tr>
              <td className="p-4 text-center text-gray-500" colSpan={4}>
                No users for this filter.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
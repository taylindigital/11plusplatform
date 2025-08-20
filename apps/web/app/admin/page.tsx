'use client';

import { useEffect, useState } from 'react';
import { useMsal } from '@azure/msal-react';
import { InteractionRequiredAuthError } from '@azure/msal-browser';

type UserRow = {
  subject: string;
  email: string;
  display_name: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  updated_at: string;
};

type Filter = 'pending' | 'approved' | 'rejected' | 'all';

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? 'https://app-11plusplatform-dev-uks.azurewebsites.net';
const API_SCOPE = process.env.NEXT_PUBLIC_API_SCOPE!;

export default function AdminPage() {
  const { instance, accounts } = useMsal();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [filter, setFilter] = useState<Filter>('pending');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function getToken(): Promise<string> {
    const account = accounts[0];
    if (!account) throw new Error('No signed-in account');
    try {
      const { accessToken } = await instance.acquireTokenSilent({
        account,
        scopes: [API_SCOPE],
      });
      return accessToken;
    } catch (e) {
      if (e instanceof InteractionRequiredAuthError) {
        await instance.acquireTokenRedirect({
          account,
          scopes: [API_SCOPE],
        });
      }
      // This line will only run on non-redirectable errors
      throw e;
    }
  }

  async function loadUsers(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const qs = filter === 'all' ? '' : `?status=${filter}`;
      const resp = await fetch(`${API_BASE}/api/admin/users${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // parse json defensively
      const data: unknown = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const msg =
          (typeof data === 'object' &&
            data !== null &&
            'error' in data &&
            typeof (data as { error?: unknown }).error === 'string' &&
            (data as { error: string }).error) || 'Failed to load users';
        throw new Error(msg);
      }

      // accept either array or { ok, users }
      const list: UserRow[] = Array.isArray(data)
        ? (data as UserRow[])
        : (typeof data === 'object' &&
            data !== null &&
            'users' in data &&
            Array.isArray((data as { users?: unknown }).users)
          ? ((data as { users: UserRow[] }).users)
          : []);

      setUsers(list);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function changeStatus(subject: string, action: 'approve' | 'reject'): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const resp = await fetch(
        `${API_BASE}/api/admin/users/${encodeURIComponent(subject)}/${action}`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const data: unknown = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const msg =
          (typeof data === 'object' &&
            data !== null &&
            'error' in data &&
            typeof (data as { error?: unknown }).error === 'string' &&
            (data as { error: string }).error) || 'Failed to update';
        throw new Error(msg);
      }

      await loadUsers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
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
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
            setFilter(e.target.value as Filter)
          }
        >
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="all">All</option>
        </select>

        <button
          className="ml-auto border rounded px-3 py-1 text-sm"
          onClick={() => void loadUsers()}
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
            <tr key={u.subject} className="border-t">
              <td className="p-2">{u.email}</td>
              <td className="p-2">{u.display_name || '—'}</td>
              <td className="p-2">{u.status}</td>
              <td className="p-2 text-right">
                <button
                  className="mr-2 border rounded px-2 py-1"
                  disabled={u.status === 'approved' || loading}
                  onClick={() => void changeStatus(u.subject, 'approve')}
                >
                  Approve
                </button>
                <button
                  className="border rounded px-2 py-1"
                  disabled={u.status === 'rejected' || loading}
                  onClick={() => void changeStatus(u.subject, 'reject')}
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
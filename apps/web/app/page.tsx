'use client';

import Link from 'next/link';
import { useAuth } from './providers';

export default function Home() {
  const { msal, account, login, logout } = useAuth();

  const username = account?.username ?? '';
  const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL?.toLowerCase() || '';
  const isAdmin = !!username && username.toLowerCase() === adminEmail;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-6">
      <h1 className="text-3xl font-bold">🚀 11+ Platform</h1>

      {!account && (
        <button
          className="px-4 py-2 rounded bg-blue-600 text-white"
          onClick={login}
          disabled={!msal}
        >
          Login / Sign up
        </button>
      )}

      {account && (
        <>
          <p>Signed in as <strong>{username || 'unknown'}</strong></p>
          <button
            className="px-4 py-2 rounded bg-gray-200"
            onClick={logout}
          >
            Logout
          </button>

          {isAdmin ? (
            <div className="mt-4">
              <Link href="/admin" className="underline text-blue-700">
                Go to Admin
              </Link>
            </div>
          ) : (
            <p className="text-sm text-gray-600 mt-2">
              Your account is pending approval.
            </p>
          )}
        </>
      )}
    </main>
  );
}
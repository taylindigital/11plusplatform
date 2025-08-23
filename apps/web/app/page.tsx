// apps/web/app/page.tsx
'use client';

import Link from 'next/link';
import { useAuth } from './providers';

// Prevent static generation so the client hook isn't run during prerender:
export const dynamic = 'force-dynamic';

export default function Home() {
  const { ready, account, login, logout } = useAuth();

  if (!ready) {
    return (
      <main className="min-h-screen grid place-items-center">
        <p>Initializing…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-6">
      <h1 className="text-3xl font-bold">🚀 11+ Platform</h1>

      {!account ? (
        <button
          className="px-4 py-2 rounded bg-emerald-600 text-white"
          onClick={login}
        >
          Sign in
        </button>
      ) : (
        <>
          <p className="text-sm">Signed in as {account.username}</p>
          <div className="flex gap-3">
            <Link
              href="/admin"
              className="px-3 py-2 rounded border border-gray-300 hover:bg-gray-50"
            >
              Go to Admin
            </Link>
            <button
              className="px-4 py-2 rounded bg-gray-200"
              onClick={logout}
            >
              Sign out
            </button>
          </div>
        </>
      )}
    </main>
  );
}
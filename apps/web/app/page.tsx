'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from './providers';

const ADMIN_EMAIL = (process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? '').toLowerCase();

export default function HomePage() {
  const { account, login, logout } = useAuth(); // <-- removed msal

  const email = (account?.username ?? '').toLowerCase();
  const isAdmin = ADMIN_EMAIL !== '' && email === ADMIN_EMAIL;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-3xl font-bold">🚀 11+ Platform</h1>

      {!account ? (
        <button className="px-4 py-2 rounded bg-emerald-600 text-white" onClick={login}>
          Sign in
        </button>
      ) : (
        <>
          <div className="text-sm">
            Signed in as <span className="font-semibold">{account.username}</span>
          </div>

          <div className="flex gap-3">
            <button className="px-4 py-2 rounded bg-gray-200" onClick={logout}>
              Sign out
            </button>

            {isAdmin && (
              <Link href="/admin" className="px-4 py-2 rounded bg-indigo-600 text-white">
                Go to Admin
              </Link>
            )}
          </div>
        </>
      )}
    </main>
  );
}
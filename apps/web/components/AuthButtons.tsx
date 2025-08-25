// apps/web/components/AuthButtons.tsx
'use client';

import React from 'react';
import { useAuth } from '@/app/providers';

export default function AuthButtons() {
  const { ready, account, login, logout } = useAuth();

  return (
    <div className="flex items-center gap-3">
      {!ready && <span>Initializing sign-in…</span>}

      {ready && !account && (
        <button
          type="button"
          className="px-4 py-2 rounded bg-emerald-600 text-white"
          onClick={() => void login()}
        >
          Sign in
        </button>
      )}

      {ready && account && (
        <>
          <span className="text-sm">Signed in as {account.username || account.homeAccountId}</span>
          <button
            type="button"
            className="px-3 py-2 rounded border"
            onClick={() => void logout()}
          >
            Sign out
          </button>
        </>
      )}
    </div>
  );
}
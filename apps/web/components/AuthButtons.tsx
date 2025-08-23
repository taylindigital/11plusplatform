'use client';

import React from 'react';
import { useAuth } from '@/app/providers';

export default function AuthButtons(): React.ReactElement {
  const { ready, account, login, logout } = useAuth();

  if (!ready) {
    return <div className="text-sm text-gray-600">Initializing authentication…</div>;
  }

  return (
    <div className="flex items-center gap-3">
      {account ? (
        <>
          <span className="text-sm">Signed in as <strong>{account.username}</strong></span>
          <button
            className="px-3 py-2 rounded bg-gray-200 hover:bg-gray-300"
            onClick={() => void logout()}
          >
            Sign out
          </button>
        </>
      ) : (
        <button
          className="px-3 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700"
          onClick={() => void login()}
        >
          Sign in
        </button>
      )}
    </div>
  );
}
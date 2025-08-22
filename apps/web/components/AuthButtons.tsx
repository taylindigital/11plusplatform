'use client';

import React, { useEffect, useState } from 'react';
import { getMsal, getActiveAccount, login, logout } from '@/lib/msalClient';
import type { AccountInfo } from '@azure/msal-browser';

export default function AuthButtons() {
  const [account, setAccount] = useState<AccountInfo | null>(null);

  useEffect(() => {
    // Ensure MSAL is created and pick up current account
    try {
      const msal = getMsal();
      const acc = getActiveAccount();
      setAccount(acc);

      // Keep state in sync if something changes accounts
      const cbId = msal.addEventCallback((e) => {
        if (e.eventType === 'msal:loginSuccess' && e.payload && 'account' in e.payload) {
          const a = (e.payload as { account?: AccountInfo }).account ?? null;
          if (a) {
            msal.setActiveAccount(a);
            setAccount(a);
          }
        }
        if (e.eventType === 'msal:logoutSuccess') {
          setAccount(null);
        }
      });
      return () => { if (cbId) msal.removeEventCallback(cbId); };
    } catch {
      // SSR or init error: ignore — buttons still render
      return;
    }
  }, []);

  if (!account) {
    return (
      <button
        className="px-4 py-2 rounded bg-emerald-600 text-white"
        onClick={() => void login()}
      >
        Sign in
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-700">
        Signed in as <strong>{account.username || account.homeAccountId}</strong>
      </span>
      <button
        className="px-3 py-2 rounded bg-gray-200 hover:bg-gray-300"
        onClick={() => void logout()}
      >
        Sign out
      </button>
    </div>
  );
}
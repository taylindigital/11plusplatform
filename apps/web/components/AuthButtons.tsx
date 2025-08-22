'use client';

import React, { useEffect, useState } from 'react';
import { ensureMsalReady, getActiveAccount, login, logout, getMsal } from '@/lib/msalClient';
import type { AccountInfo, EventCallbackFunction } from '@azure/msal-browser';

export default function AuthButtons() {
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let removeCb: (() => void) | null = null;

    (async () => {
      try {
        await ensureMsalReady();
        const msal = getMsal();

        const acc = await getActiveAccount();
        setAccount(acc);
        setReady(true);

        const cb: EventCallbackFunction = (e) => {
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
        };

        const id = msal.addEventCallback(cb);
        removeCb = () => { if (id) msal.removeEventCallback(id); };
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Auth init failed', err);
      }
    })();

    return () => { if (removeCb) removeCb(); };
  }, []);

  // While MSAL initializes, render a disabled button (avoids clicks when not ready)
  if (!ready) {
    return (
      <button className="px-4 py-2 rounded bg-gray-300 text-gray-600 cursor-not-allowed" disabled>
        Loading…
      </button>
    );
  }

  if (!account) {
    return (
      <button
        className="px-4 py-2 rounded bg-emerald-600 text-white"
        onClick={() => { void login(); }}
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
        onClick={() => { void logout(); }}
      >
        Sign out
      </button>
    </div>
  );
}
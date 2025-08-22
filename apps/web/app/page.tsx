'use client';

import React from 'react';
import { useAuth } from './providers';

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-lg">
      <span className="font-semibold">{label}:</span>{' '}
      <span className="break-all">{value || '(missing)'}</span>
    </div>
  );
}

export default function Page() {
  const { ready, account, login, logout } = useAuth();

  // Read the public env the same way the provider does
  const scope =
    (typeof window !== 'undefined' &&
      (window as unknown as { __env?: Record<string, string> }).__env &&
      (window as unknown as { __env: Record<string, string> }).__env['NEXT_PUBLIC_API_SCOPE']) ||
    process.env.NEXT_PUBLIC_API_SCOPE ||
    '';

  const authority =
    (typeof window !== 'undefined' &&
      (window as unknown as { __env?: Record<string, string> }).__env &&
      (window as unknown as { __env: Record<string, string> }).__env['NEXT_PUBLIC_CIAM_AUTHORITY']) ||
    process.env.NEXT_PUBLIC_CIAM_AUTHORITY ||
    '';

  const userFlow =
    (typeof window !== 'undefined' &&
      (window as unknown as { __env?: Record<string, string> }).__env &&
      (window as unknown as { __env: Record<string, string> }).__env['NEXT_PUBLIC_CIAM_USER_FLOW']) ||
    process.env.NEXT_PUBLIC_CIAM_USER_FLOW ||
    'SignUpSignIn';

  const metadata =
    (typeof window !== 'undefined' &&
      (window as unknown as { __env?: Record<string, string> }).__env &&
      (window as unknown as { __env: Record<string, string> }).__env['NEXT_PUBLIC_CIAM_METADATA_URL']) ||
    process.env.NEXT_PUBLIC_CIAM_METADATA_URL ||
    '';

  const redirect =
    (typeof window !== 'undefined' &&
      (window as unknown as { __env?: Record<string, string> }).__env &&
      (window as unknown as { __env: Record<string, string> }).__env['NEXT_PUBLIC_REDIRECT_URI']) ||
    process.env.NEXT_PUBLIC_REDIRECT_URI ||
    (typeof window !== 'undefined' ? window.location.origin + '/' : '/');

  const authorityWithFlow = authority ? authority.replace(/\/+$/, '') + `/${userFlow}/v2.0` : '';

  return (
    <main className="min-h-screen flex flex-col items-center justify-start gap-6 p-8">
      <h1 className="text-4xl font-extrabold">🚀 11+ Platform — Login Debug</h1>

      <div className="space-y-2 max-w-3xl w-full">
        <Line label="authority" value={authorityWithFlow} />
        <Line label="metadata" value={metadata} />
        <Line label="clientId present" value={(process.env.NEXT_PUBLIC_CIAM_CLIENT_ID ? 'yes' : 'no')} />
        <Line label="redirectUri" value={redirect} />
        <Line label="api scope" value={scope} />
      </div>

      <div className="flex gap-4 mt-4">
        <button
          className="px-5 py-3 rounded bg-gray-200 hover:bg-gray-300"
          onClick={async () => {
            const r = await fetch(metadata, { mode: 'cors' });
            alert(`metadata ${r.status}`);
          }}
        >
          Check discovery
        </button>

        {!account ? (
          <button
            className="px-6 py-3 rounded bg-emerald-600 text-white text-xl disabled:opacity-50"
            onClick={() => void login()}
            disabled={!ready}
          >
            Sign in
          </button>
        ) : (
          <button
            className="px-6 py-3 rounded bg-rose-600 text-white text-xl disabled:opacity-50"
            onClick={() => void logout()}
            disabled={!ready}
          >
            Sign out ({account.username})
          </button>
        )}
      </div>

      <div className="mt-6 text-emerald-700 font-semibold">
        {ready ? 'MSAL ready' : 'Initializing MSAL…'}
      </div>
    </main>
  );
}
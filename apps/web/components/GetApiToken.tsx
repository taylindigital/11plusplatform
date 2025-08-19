'use client';
import { useMsal } from '@azure/msal-react';
import { useState } from 'react';

const SCOPE = process.env.NEXT_PUBLIC_API_SCOPE!;

function decodeJwtPart(part: string) {
  try {
    return JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

export default function GetApiToken() {
  const { instance, accounts } = useMsal();
  const [token, setToken] = useState<string | null>(null);
  const [claims, setClaims] = useState<any>(null);
  const loggedIn = accounts.length > 0;

  const getToken = async () => {
    if (!loggedIn) return alert('Please sign in first.');
    const account = accounts[0];

    try {
      // try silent first
      const silent = await instance.acquireTokenSilent({
        account,
        scopes: [SCOPE],
      });
      setToken(silent.accessToken);
      const parts = silent.accessToken.split('.');
      setClaims(parts.length === 3 ? decodeJwtPart(parts[1]) : null);
    } catch {
      // fall back to interactive
      await instance.acquireTokenRedirect({ scopes: [SCOPE] });
    }
  };

  return (
    <div className="mt-4 p-4 rounded border">
      <button className="px-4 py-2 rounded bg-emerald-600 text-white" onClick={getToken}>
        Get API Token
      </button>
      {token && (
        <div className="mt-3 text-sm">
          <div><strong>Access token (aud):</strong> {claims?.aud}</div>
          <div><strong>Scope:</strong> {claims?.scp}</div>
          <details className="mt-2">
            <summary>Show claims</summary>
            <pre className="text-xs overflow-auto">{JSON.stringify(claims, null, 2)}</pre>
          </details>
        </div>
      )}
    </div>
  );
}
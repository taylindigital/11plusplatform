'use client';

import { useState } from 'react';
import { useMsal } from '@azure/msal-react';

const API_SCOPE = process.env.NEXT_PUBLIC_API_SCOPE || ''; // e.g. "api://<API_CLIENT_ID>/access_as_user"

function safeDecodeJwt(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export default function GetApiToken() {
  const { instance, accounts } = useMsal();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [claims, setClaims] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const getToken = async () => {
    setError(null);
    setAccessToken(null);
    setClaims(null);

    if (!API_SCOPE) {
      setError('API scope is not configured.');
      return;
    }
    if (!accounts || accounts.length === 0) {
      setError('Please sign in first.');
      return;
    }

    const request = { scopes: [API_SCOPE], account: accounts[0] };

    try {
      // Try silent first
      const res = await instance.acquireTokenSilent(request);
      const at = res.accessToken;
      setAccessToken(at);
      setClaims(safeDecodeJwt(at));
    } catch (e) {
      // If user interaction is required, redirect
      // (MSAL will return here after auth completes)
      await instance.acquireTokenRedirect({ scopes: [API_SCOPE] });
    }
  };

  return (
    <div className="mt-4 p-4 rounded border">
      <button className="px-4 py-2 rounded bg-emerald-600 text-white" onClick={getToken}>
        Get API Token
      </button>

      {error && <p className="text-red-600 mt-2">{error}</p>}

      {claims && (
        <div className="mt-3 text-sm">
          <div><strong>aud:</strong> {String(claims['aud'] ?? '')}</div>
          <div><strong>scp:</strong> {String(claims['scp'] ?? '')}</div>
          <details className="mt-2">
            <summary>Show full claims</summary>
            <pre className="text-xs overflow-auto">{JSON.stringify(claims, null, 2)}</pre>
          </details>
        </div>
      )}

      {accessToken && (
        <details className="mt-2">
          <summary>Show raw access token</summary>
          <pre className="text-xs overflow-auto break-all">{accessToken}</pre>
        </details>
      )}
    </div>
  );
}
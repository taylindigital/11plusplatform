'use client';

import { useState } from 'react';
import { useMsal } from '@azure/msal-react';
import { InteractionRequiredAuthError } from '@azure/msal-browser';

const API_SCOPE = process.env.NEXT_PUBLIC_API_SCOPE!;

// Minimal JWT payload decoder (browser-safe)
function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length < 2) return {};
  let payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  // pad to multiple of 4
  while (payload.length % 4) payload += '=';
  try {
    const json = atob(payload);
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export default function GetApiToken() {
  const { instance, accounts } = useMsal();
  const [accessToken, setAccessToken] = useState<string>('');
  const [claims, setClaims] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string>('');

  async function getToken() {
    setError('');
    setClaims(null);
    setAccessToken('');
    const account = accounts[0];
    if (!account) {
      setError('No signed-in account');
      return;
    }

    try {
      const { accessToken: at } = await instance.acquireTokenSilent({
        account,
        scopes: [API_SCOPE],
      });
      setAccessToken(at);
      setClaims(decodeJwtPayload(at));
    } catch (e) {
      if (e instanceof InteractionRequiredAuthError) {
        await instance.acquireTokenRedirect({ account, scopes: [API_SCOPE] });
        return;
      }
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    }
  }

  return (
    <div className="mt-4 p-4 rounded border">
      <button className="px-4 py-2 rounded bg-emerald-600 text-white" onClick={getToken}>
        Get API Token
      </button>

      {error && <p className="text-red-600 mt-2">{error}</p>}

      {claims && (
        <div className="mt-3 text-sm">
          <div>
            <strong>aud:</strong> {String(claims['aud'] ?? '')}
          </div>
          <div>
            <strong>scp:</strong> {String(claims['scp'] ?? '')}
          </div>
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
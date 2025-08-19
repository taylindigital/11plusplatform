'use client';

import { useMsal } from '@azure/msal-react';
import { useState } from 'react';

const API_SCOPE = process.env.NEXT_PUBLIC_API_SCOPE || '';
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'https://app-11plusplatform-dev-uks.azurewebsites.net';

export default function CallApi() {
  const { instance, accounts } = useMsal();
  const [result, setResult] = useState<string>('');

  const callPing = async () => {
    if (!API_SCOPE) return setResult('API scope not configured');
    if (!accounts?.length) return setResult('Please sign in first');

    const { accessToken } = await instance.acquireTokenSilent({
      account: accounts[0],
      scopes: [API_SCOPE],
    });

    const res = await fetch(`${API_BASE}/api/ping`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const text = await res.text();
    setResult(`${res.status}: ${text}`);
  };

  return (
    <div className="mt-4 p-4 rounded border">
      <button className="px-4 py-2 rounded bg-indigo-600 text-white" onClick={callPing}>
        Call /api/ping
      </button>
      {result && (
        <pre className="text-xs overflow-auto mt-3">{result}</pre>
      )}
    </div>
  );
}
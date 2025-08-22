'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  PublicClientApplication,
  Configuration,
  RedirectRequest,
  SilentRequest,
  AccountInfo,
} from '@azure/msal-browser';

type EnvBag = Partial<Record<
  'NEXT_PUBLIC_CIAM_CLIENT_ID' |
  'NEXT_PUBLIC_CIAM_TENANT_ID' |
  'NEXT_PUBLIC_CIAM_TENANT_SUBDOMAIN' |
  'NEXT_PUBLIC_CIAM_USER_FLOW' |
  'NEXT_PUBLIC_REDIRECT_URI' |
  'NEXT_PUBLIC_API_SCOPE',
  string
>>;

function readEnv(): EnvBag {
  const w = typeof window !== 'undefined' ? (window as unknown as { __env?: EnvBag }) : undefined;
  const injected = (w?.__env ?? {}) as EnvBag;

  return {
    NEXT_PUBLIC_CIAM_CLIENT_ID:
      injected.NEXT_PUBLIC_CIAM_CLIENT_ID ?? process.env.NEXT_PUBLIC_CIAM_CLIENT_ID,
    NEXT_PUBLIC_CIAM_TENANT_ID:
      injected.NEXT_PUBLIC_CIAM_TENANT_ID ?? process.env.NEXT_PUBLIC_CIAM_TENANT_ID,
    NEXT_PUBLIC_CIAM_TENANT_SUBDOMAIN:
      injected.NEXT_PUBLIC_CIAM_TENANT_SUBDOMAIN ?? process.env.NEXT_PUBLIC_CIAM_TENANT_SUBDOMAIN,
    NEXT_PUBLIC_CIAM_USER_FLOW:
      injected.NEXT_PUBLIC_CIAM_USER_FLOW ?? process.env.NEXT_PUBLIC_CIAM_USER_FLOW,
    NEXT_PUBLIC_REDIRECT_URI:
      injected.NEXT_PUBLIC_REDIRECT_URI ?? process.env.NEXT_PUBLIC_REDIRECT_URI,
    NEXT_PUBLIC_API_SCOPE:
      injected.NEXT_PUBLIC_API_SCOPE ?? process.env.NEXT_PUBLIC_API_SCOPE,
  };
}

export default function LoginDebugPage() {
  const env = useMemo(readEnv, []);
  const [msal, setMsal] = useState<PublicClientApplication | null>(null);
  const [ready, setReady] = useState(false);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [msg, setMsg] = useState<string>('');
  const [error, setError] = useState<string>('');

  const authority = useMemo(() => {
    const tenantId = env.NEXT_PUBLIC_CIAM_TENANT_ID ?? '';
    const subdomain = env.NEXT_PUBLIC_CIAM_TENANT_SUBDOMAIN ?? '';
    const userFlow = env.NEXT_PUBLIC_CIAM_USER_FLOW ?? 'SignUpSignIn';
    if (!tenantId || !subdomain) return '';
    return `https://${subdomain}.ciamlogin.com/${tenantId}/${userFlow}/v2.0`;
  }, [env]);

  const metadataUrl = useMemo(() => {
    const tenantId = env.NEXT_PUBLIC_CIAM_TENANT_ID ?? '';
    const subdomain = env.NEXT_PUBLIC_CIAM_TENANT_SUBDOMAIN ?? '';
    const userFlow = env.NEXT_PUBLIC_CIAM_USER_FLOW ?? 'SignUpSignIn';
    if (!tenantId || !subdomain) return '';
    return `https://${subdomain}.ciamlogin.com/${tenantId}/v2.0/.well-known/openid-configuration?p=${userFlow}`;
  }, [env]);

  useEffect(() => {
    setError('');
    setMsg('');

    const clientId = env.NEXT_PUBLIC_CIAM_CLIENT_ID ?? '';
    const redirectUri = env.NEXT_PUBLIC_REDIRECT_URI ?? '';

    if (!clientId || !authority || !redirectUri) {
      setError('Missing clientId/authority/redirectUri — check SWA env and __env injection.');
      return;
    }

    const cfg: Configuration = {
      auth: {
        clientId,
        authority,
        knownAuthorities: [
          `${env.NEXT_PUBLIC_CIAM_TENANT_SUBDOMAIN}.ciamlogin.com`,
          `${env.NEXT_PUBLIC_CIAM_TENANT_ID}.ciamlogin.com`,
        ].filter(Boolean) as string[],
        redirectUri,
        authorityMetadata: metadataUrl,
      },
      cache: { cacheLocation: 'localStorage', storeAuthStateInCookie: true },
    };

    const inst = new PublicClientApplication(cfg);

    inst
      .initialize()
      .then(() => inst.handleRedirectPromise())
      .then((resp) => {
        if (resp?.account) {
          inst.setActiveAccount(resp.account);
          setAccount(resp.account);
        } else {
          const existing = inst.getAllAccounts()[0];
          if (existing) {
            inst.setActiveAccount(existing);
            setAccount(existing);
          }
        }
        setMsal(inst);
        setReady(true);
        setMsg('MSAL ready');
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : String(e);
        setError(`MSAL init error: ${message}`);
      });
  }, [env, authority, metadataUrl]);

  const login = async () => {
    if (!msal) return;
    setError('');
    const req: RedirectRequest = {
      scopes: [],
      redirectUri: env.NEXT_PUBLIC_REDIRECT_URI ?? window.location.origin,
    };
    await msal.loginRedirect(req);
  };

  const logout = async () => {
    if (!msal) return;
    await msal.logoutRedirect({
      postLogoutRedirectUri: env.NEXT_PUBLIC_REDIRECT_URI ?? window.location.origin,
    });
  };

  const getApiToken = async () => {
    if (!msal) return;
    setError('');
    try {
      const scopes = [env.NEXT_PUBLIC_API_SCOPE ?? ''];
      const acc = account ?? msal.getAllAccounts()[0] ?? null;
      if (!acc) {
        setError('No account — sign in first.');
        return;
      }
      const req: SilentRequest = { account: acc, scopes };
      const { accessToken } = await msal.acquireTokenSilent(req);
      setMsg(`Got token (aud scope): ${scopes[0]}`);
      console.log('accessToken', accessToken);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setError(`acquireTokenSilent failed: ${message}`);
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6">
      <h1 className="text-4xl font-bold">🚀 11+ Platform — Login Debug</h1>

      <div className="text-sm leading-6">
        <div><strong>authority</strong>: {authority || '(missing)'}</div>
        <div><strong>metadata</strong>: {metadataUrl || '(missing)'}</div>
        <div><strong>clientId present</strong>: {env.NEXT_PUBLIC_CIAM_CLIENT_ID ? 'yes' : 'no'}</div>
        <div><strong>redirectUri</strong>: {env.NEXT_PUBLIC_REDIRECT_URI || '(missing)'}</div>
        <div><strong>api scope</strong>: {env.NEXT_PUBLIC_API_SCOPE || '(missing)'}</div>
      </div>

      {!ready && (
        <p className="text-gray-600">Initializing MSAL… {error && <span className="text-red-600">{error}</span>}</p>
      )}

      {ready && (
        <div className="flex items-center gap-4">
          {!account ? (
            <button
              onClick={login}
              className="px-6 py-3 rounded-lg bg-emerald-600 text-white font-semibold shadow"
            >
              Sign in
            </button>
          ) : (
            <>
              <span>Signed in as <strong>{account.username || account.homeAccountId}</strong></span>
              <button onClick={getApiToken} className="px-4 py-2 rounded bg-indigo-600 text-white">
                Get API token
              </button>
              <button onClick={logout} className="px-4 py-2 rounded bg-gray-200">
                Sign out
              </button>
            </>
          )}
        </div>
      )}

      {msg && <p className="text-emerald-700">{msg}</p>}
      {error && <p className="text-red-600">{error}</p>}
    </main>
  );
}
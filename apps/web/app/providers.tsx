// apps/web/app/providers.tsx
'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  PublicClientApplication,
  type Configuration,
  type AccountInfo,
  type SilentRequest,
  type RedirectRequest,
} from '@azure/msal-browser';

type AuthContextValue = {
  msal?: PublicClientApplication;
  account: AccountInfo | null;
  ready: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  getToken: (scopes: string[]) => Promise<string>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function buildAuthorityPieces(): {
  clientId: string;
  authority: string;
  metadataUrl?: string;
  knownAuthorities: string[];
  redirectUri: string;
} {
  const env = (typeof window !== 'undefined' ? (window as unknown as { __env?: Record<string, string> }).__env : undefined) ?? {};

  const CLIENT_ID = env.NEXT_PUBLIC_CIAM_CLIENT_ID || '';
  const BASE_AUTHORITY = (env.NEXT_PUBLIC_CIAM_AUTHORITY || '').replace(/\/+$/, '');
  const USER_FLOW = (env.NEXT_PUBLIC_CIAM_USER_FLOW || '').replace(/\/+$/, '');
  const DOMAIN = (env.NEXT_PUBLIC_CIAM_DOMAIN || '').toLowerCase();
  const TENANT_ID = (env.NEXT_PUBLIC_CIAM_TENANT_ID || '').toLowerCase();
  const metadataUrl = env.NEXT_PUBLIC_CIAM_METADATA_URL || undefined;
  const redirectUri = env.NEXT_PUBLIC_REDIRECT_URI || window.location.origin + '/';

  // Build B2C/CIAM authority with user flow segment
  const authority =
    USER_FLOW && BASE_AUTHORITY
      ? `${BASE_AUTHORITY}/${USER_FLOW}/v2.0`
      : BASE_AUTHORITY || '';

  const knownAuthorities: string[] = [];
  if (DOMAIN) knownAuthorities.push(DOMAIN);
  if (TENANT_ID) knownAuthorities.push(`${TENANT_ID}.ciamlogin.com`);

  // Expose debug config
  (window as unknown as {
    __lastMsalCfg?: {
      authority?: string;
      metadataUrl?: string;
      knownAuthorities?: string[];
      clientIdPresent: boolean;
      hasAuthorityMetadata: boolean;
      redirectUri: string;
    };
  }).__lastMsalCfg = {
    authority,
    metadataUrl,
    knownAuthorities,
    clientIdPresent: Boolean(CLIENT_ID),
    hasAuthorityMetadata: Boolean(metadataUrl),
    redirectUri,
  };

  return { clientId: CLIENT_ID, authority, metadataUrl, knownAuthorities, redirectUri };
}

export default function Providers({ children }: { children: ReactNode }) {
  const [{ msal, account, ready }, setState] = useState<{
    msal?: PublicClientApplication;
    account: AccountInfo | null;
    ready: boolean;
  }>({ msal: undefined, account: null, ready: false });

  const cfg = useMemo(buildAuthorityPieces, []);

  useEffect(() => {
    let mounted = true;

    async function init() {
      // Guard: must have clientId and authority
      if (!cfg.clientId || !cfg.authority) {
        // Render UI but login won’t work—helps you see missing vars quickly
        if (mounted) setState((s) => ({ ...s, ready: true }));
        return;
      }

      const authCfg: Configuration['auth'] = {
        clientId: cfg.clientId,
        authority: cfg.authority,
        knownAuthorities: cfg.knownAuthorities.length ? cfg.knownAuthorities : undefined,
        redirectUri: cfg.redirectUri,
      };

      const configuration: Configuration = { auth: authCfg };

      // If you provided explicit metadata URL, attach it (MSAL will trust it)
      if (cfg.metadataUrl) {
        (configuration as unknown as { auth: { authorityMetadata: string } }).auth.authorityMetadata =
          JSON.stringify({ authority_metadata_url: cfg.metadataUrl });
      }

      const instance = new PublicClientApplication(configuration);
      await instance.initialize();

      // Handle the redirect hash if present
      try {
        await instance.handleRedirectPromise();
      } catch {
        // swallow; UI will still show and allow login retry
      }

      const accounts = instance.getAllAccounts();
      const first = accounts[0] ?? null;

      // Expose for quick console diagnosis
      (window as unknown as { msalInstance?: PublicClientApplication }).msalInstance = instance;

      if (!mounted) return;
      setState({ msal: instance, account: first, ready: true });
    }

    void init();
    return () => {
      mounted = false;
    };
  }, [cfg.clientId, cfg.authority, cfg.knownAuthorities, cfg.metadataUrl, cfg.redirectUri]);

  const login = async (): Promise<void> => {
    if (!msal) return;
    const request: RedirectRequest = {
      // For login you can pass a minimal scope; token acquisition can request API scope later
      scopes: ['openid'],
      redirectUri: cfg.redirectUri,
    };
    await msal.acquireTokenRedirect(request);
  };

  const logout = async (): Promise<void> => {
    if (!msal) return;
    await msal.logoutRedirect({ postLogoutRedirectUri: cfg.redirectUri });
  };

  const getToken = async (scopes: string[]): Promise<string> => {
    if (!msal) throw new Error('MSAL not ready');
    const acct = account ?? msal.getAllAccounts()[0] ?? null;
    if (!acct) {
      // Not signed in; start login
      await login();
      return '';
    }
    const request: SilentRequest = { account: acct, scopes };
    const result = await msal.acquireTokenSilent(request);
    return result.accessToken;
  };

  const value: AuthContextValue = { msal, account, ready, login, logout, getToken };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <Providers>');
  return ctx;
}
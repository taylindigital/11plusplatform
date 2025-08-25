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
  type AccountInfo,
  type RedirectRequest,
  type SilentRequest,
} from '@azure/msal-browser';

declare global {
  interface Window {
    __env?: Record<string, string>;
    msalInstance?: PublicClientApplication;
    __lastMsalCfg?: {
      authority?: string;
      metadataUrl?: string;
      knownAuthorities?: string[];
      clientIdPresent: boolean;
      hasAuthorityMetadata: boolean;
      redirectUri: string;
      apiScope?: string;
    };
  }
}

type AuthCtx = {
  ready: boolean;
  account: AccountInfo | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  getToken: (scope: string) => Promise<string>;
};

const AuthContext = createContext<AuthCtx | null>(null);

export default function Providers({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [account, setAccount] = useState<AccountInfo | null>(null);

  // Read env from window.__env injected by layout.tsx
  const env = typeof window !== 'undefined' ? window.__env ?? {} : {};
  const CLIENT_ID = env.NEXT_PUBLIC_CIAM_CLIENT_ID;
  const AUTHORITY = env.NEXT_PUBLIC_CIAM_AUTHORITY; // e.g. https://{tenant}.ciamlogin.com/{tenantId}/SignUpSignIn/v2.0
  const REDIRECT_URI = env.NEXT_PUBLIC_REDIRECT_URI || (typeof window !== 'undefined' ? window.location.origin + '/' : '/');
  const API_SCOPE = env.NEXT_PUBLIC_API_SCOPE;
  const KNOWN_AUTHORITIES = [
    env.NEXT_PUBLIC_CIAM_DOMAIN,             // e.g. 11plusdevuks.ciamlogin.com
    `${env.NEXT_PUBLIC_CIAM_TENANT_ID}.ciamlogin.com`,
  ].filter(Boolean) as string[];

  useEffect(() => {
    let cancelled = false;

    async function init() {
      // Basic sanity check
      const clientIdPresent = Boolean(CLIENT_ID);
      const authorityOk = Boolean(AUTHORITY && AUTHORITY.startsWith('https://'));

      // Debug snapshot
      if (typeof window !== 'undefined') {
        window.__lastMsalCfg = {
          authority: AUTHORITY,
          metadataUrl: env.NEXT_PUBLIC_CIAM_METADATA_URL,
          knownAuthorities: KNOWN_AUTHORITIES,
          clientIdPresent,
          hasAuthorityMetadata: Boolean(env.NEXT_PUBLIC_CIAM_METADATA_URL),
          redirectUri: REDIRECT_URI,
          apiScope: API_SCOPE,
        };
      }

      if (!clientIdPresent || !authorityOk) {
        // Render UI but block login if config is missing
        setReady(true);
        return;
      }

      const pca = new PublicClientApplication({
        auth: {
          clientId: CLIENT_ID!,
          authority: AUTHORITY!,
          knownAuthorities: KNOWN_AUTHORITIES.length ? KNOWN_AUTHORITIES : undefined,
          redirectUri: REDIRECT_URI,
        },
        cache: {
          cacheLocation: 'localStorage',
          storeAuthStateInCookie: false,
        },
      });

      // Must run once per page load
      await pca.initialize();
      await pca.handleRedirectPromise().catch(() => { /* ignore on first load */ });

      const accts = pca.getAllAccounts();
      setAccount(accts[0] ?? null);

      if (!cancelled) {
        window.msalInstance = pca;
        setReady(true);
      }
    }

    void init();

    return () => {
      cancelled = true;
    };
    // Only run once on first mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async (): Promise<void> => {
    if (!window.msalInstance) return;
    // For login you can request minimal scopes; API scopes come later
    const req: RedirectRequest = {
      scopes: ['openid', 'profile'],
      redirectUri: REDIRECT_URI,
    };
    await window.msalInstance.loginRedirect(req);
  };

  const logout = async (): Promise<void> => {
    if (!window.msalInstance) return;
    await window.msalInstance.logoutRedirect({ postLogoutRedirectUri: REDIRECT_URI });
  };

  const getToken = async (scope: string): Promise<string> => {
    if (!window.msalInstance) throw new Error('MSAL not ready');
    const accts = window.msalInstance.getAllAccounts();
    const active = accts[0];
    if (!active) throw new Error('No signed-in account');
    const req: SilentRequest = { account: active, scopes: [scope] };
    const result = await window.msalInstance.acquireTokenSilent(req);
    return result.accessToken;
  };

  const value: AuthCtx = useMemo(
    () => ({ ready, account, login, logout, getToken }),
    [ready, account],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <Providers>');
  return ctx;
}
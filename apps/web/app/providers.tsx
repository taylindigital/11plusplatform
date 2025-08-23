// apps/web/app/providers.tsx
'use client';

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  PublicClientApplication,
  Configuration,
  AccountInfo,
  RedirectRequest,
  SilentRequest,
} from '@azure/msal-browser';

/* ----------------------------------------------------------------------------
   Small helpers
---------------------------------------------------------------------------- */

function fromEnv(key: string): string {
  // Runtime (SWA-injected) first, build-time fallback second
  if (typeof window !== 'undefined' && (window as unknown as { __env?: Record<string, string> }).__env) {
    const v = (window as unknown as { __env: Record<string, string> }).__env[key];
    if (typeof v === 'string' && v.length) return v;
  }
  const v = (process.env as Record<string, string | undefined>)[key];
  return typeof v === 'string' ? v : '';
}

function trimSlashes(s: string): string {
  return s.replace(/\/+$/, '');
}

/* ----------------------------------------------------------------------------
   Build B2C authority + metadata
---------------------------------------------------------------------------- */

const TENANT_ID = fromEnv('NEXT_PUBLIC_CIAM_TENANT_ID');           // e.g. 662ecf18-...
const USER_FLOW = fromEnv('NEXT_PUBLIC_CIAM_USER_FLOW') || 'SignUpSignIn';
const DOMAIN    = trimSlashes(fromEnv('NEXT_PUBLIC_CIAM_DOMAIN'));  // e.g. 11plusdevuks.ciamlogin.com

// Prefer explicit authority if set; otherwise compose it
const EXPLICIT_AUTHORITY = trimSlashes(fromEnv('NEXT_PUBLIC_CIAM_AUTHORITY'));
const AUTHORITY = EXPLICIT_AUTHORITY
  ? `${EXPLICIT_AUTHORITY}/${USER_FLOW}/v2.0`
  : (TENANT_ID && DOMAIN)
    ? `https://${DOMAIN}/${TENANT_ID}/${USER_FLOW}/v2.0`
    : ''; // will be validated before use

// Prefer explicit metadata URL if set; otherwise compose it
const EXPLICIT_METADATA = trimSlashes(fromEnv('NEXT_PUBLIC_CIAM_METADATA_URL'));
const METADATA_URL = EXPLICIT_METADATA
  ? EXPLICIT_METADATA
  : (TENANT_ID && DOMAIN)
    ? `https://${DOMAIN}/${TENANT_ID}/v2.0/.well-known/openid-configuration?p=${USER_FLOW}`
    : '';

const CLIENT_ID   = fromEnv('NEXT_PUBLIC_CIAM_CLIENT_ID');
const REDIRECT_URI =
  fromEnv('NEXT_PUBLIC_REDIRECT_URI') ||
  (typeof window !== 'undefined' ? `${window.location.origin}/` : '/');

const API_SCOPE   = fromEnv('NEXT_PUBLIC_API_SCOPE'); // e.g. api://.../access_as_user

/* ----------------------------------------------------------------------------
   Context
---------------------------------------------------------------------------- */

type AuthContextValue = {
  msal?: PublicClientApplication;
  account?: AccountInfo | null;
  ready: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  getToken: (scopes?: string[]) => Promise<string>;
};

const AuthContext = createContext<AuthContextValue>({
  msal: undefined,
  account: null,
  ready: false,
  login: async () => {},
  logout: async () => {},
  getToken: async () => '',
});

export const useAuth = () => useContext(AuthContext);

/* ----------------------------------------------------------------------------
   Provider
---------------------------------------------------------------------------- */

export default function Providers({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const msalRef = useRef<PublicClientApplication | undefined>(undefined);

  // Build MSAL config once
  const msalConfig: Configuration | null = useMemo(() => {
    if (!CLIENT_ID || !AUTHORITY || !METADATA_URL) return null;

    // Safe/strict config (no broker, simple cache)
    return {
      auth: {
        clientId: CLIENT_ID,
        authority: AUTHORITY,
        knownAuthorities: [DOMAIN],
        navigateToLoginRequestUrl: true,
        // optional: you can also add authorityMetadata: METADATA_URL,
      },
      cache: {
        cacheLocation: 'sessionStorage',
        storeAuthStateInCookie: false,
      },
    };
  }, []);

  // Initialize MSAL on mount
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        // Quick guard for misconfiguration
        if (!CLIENT_ID || !AUTHORITY || !METADATA_URL) {
          // eslint-disable-next-line no-console
          console.warn('MSAL login blocked: invalid config', {
            clientIdPresent: Boolean(CLIENT_ID),
            authority,
          });
          setReady(true); // render UI, but login will be blocked
          return;
        }

        const instance = new PublicClientApplication(msalConfig as Configuration);

        // Handle redirect if returning from login
        instance.addEventCallback((evt) => {
          if (evt.eventType === 'msal:handleRedirectEnd' || evt.eventType === 'msal:loginSuccess') {
            const acc = instance.getAllAccounts()[0] || null;
            setAccount(acc);
          }
        });

        await instance.initialize();

        // Try to finish redirect handling (no-op if not in a redirect)
        await instance.handleRedirectPromise();

        const acc = instance.getAllAccounts()[0] || null;
        if (!cancelled) {
          msalRef.current = instance;
          setAccount(acc);
          setReady(true);
        }

        // Debug line to verify config on page
        if (typeof window !== 'undefined') {
          (window as unknown as { __lastMsalCfg?: unknown }).__lastMsalCfg = {
            authority: AUTHORITY,
            metadata: METADATA_URL,
            clientIdPresent: Boolean(CLIENT_ID),
            redirectUri: REDIRECT_URI,
            apiScope: API_SCOPE,
          };
          // eslint-disable-next-line no-console
          console.log('[MSAL ready]');
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('MSAL init error', e);
        setReady(true);
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, []);

  // Actions
  const login = async () => {
    const msal = msalRef.current;
    if (!msal || !CLIENT_ID || !AUTHORITY) return;

    const req: RedirectRequest = {
      scopes: API_SCOPE ? [API_SCOPE] : [],
      redirectUri: REDIRECT_URI,
    };
    await msal.acquireTokenRedirect(req);
  };

  const logout = async () => {
    const msal = msalRef.current;
    if (!msal) return;
    await msal.logoutRedirect({ postLogoutRedirectUri: REDIRECT_URI });
  };

  const getToken = async (scopes?: string[]): Promise<string> => {
    const msal = msalRef.current;
    const acc = account;
    if (!msal || !acc) throw new Error('Not signed in');
    const req: SilentRequest = {
      account: acc,
      scopes: scopes && scopes.length ? scopes : (API_SCOPE ? [API_SCOPE] : []),
    };
    const { accessToken } = await msal.acquireTokenSilent(req);
    return accessToken;
  };

  const value: AuthContextValue = {
    msal: msalRef.current,
    account,
    ready,
    login,
    logout,
    getToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
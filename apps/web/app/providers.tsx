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
  EventType,
  type EventMessage,
} from '@azure/msal-browser';

/* -------------------------------------------------------------------------- */
/*  Env helpers (browser-safe)                                                */
/* -------------------------------------------------------------------------- */

function readEnv(name: string): string | undefined {
  // Prefer the injected SWA env object if present
  if (typeof window !== 'undefined' && (window as any).__env) {
    const v = (window as any).__env[name];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  // Fallback to Next public env (compiled at build time)
  if (typeof process !== 'undefined' && process.env) {
    const v = (process.env as Record<string, string | undefined>)[name];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

const TENANT_ID = readEnv('NEXT_PUBLIC_CIAM_TENANT_ID');                 // 662e...
const USER_FLOW = readEnv('NEXT_PUBLIC_CIAM_USER_FLOW') ?? 'SignUpSignIn';
const AUTHORITY = readEnv('NEXT_PUBLIC_CIAM_AUTHORITY')
  // If AUTHORITY isn’t provided, build it from tenant + policy:
  ?? (TENANT_ID ? `https://11plusdevuks.ciamlogin.com/${TENANT_ID}/${USER_FLOW}/v2.0` : undefined);

const METADATA_URL =
  readEnv('NEXT_PUBLIC_CIAM_METADATA_URL') // prefer explicit metadata url
  ?? (TENANT_ID
      ? `https://11plusdevuks.ciamlogin.com/${TENANT_ID}/v2.0/.well-known/openid-configuration?p=${USER_FLOW}`
      : undefined);

const CLIENT_ID = readEnv('NEXT_PUBLIC_CIAM_CLIENT_ID');
const REDIRECT_URI = readEnv('NEXT_PUBLIC_REDIRECT_URI') ?? (typeof window !== 'undefined' ? window.location.origin + '/' : '/');
const KNOWN_1 = readEnv('NEXT_PUBLIC_CIAM_DOMAIN');                       // 11plusdevuks.ciamlogin.com
const KNOWN_2 = TENANT_ID ? `${TENANT_ID}.ciamlogin.com` : undefined;

/* -------------------------------------------------------------------------- */
/*  Auth context                                                              */
/* -------------------------------------------------------------------------- */

type AuthContextValue = {
  ready: boolean;
  account: AccountInfo | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <Providers>');
  }
  return ctx;
}

/* -------------------------------------------------------------------------- */
/*  Provider                                                                  */
/* -------------------------------------------------------------------------- */

export default function Providers({ children }: { children: ReactNode }): JSX.Element {
  const [ready, setReady] = useState(false);
  const [account, setAccount] = useState<AccountInfo | null>(null);

  // expose a tiny debug block so you can inspect config from console
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__lastMsalCfg = {
        authority: AUTHORITY,
        metadataUrl: METADATA_URL,
        clientIdPresent: Boolean(CLIENT_ID),
        redirectUri: REDIRECT_URI,
        knownAuthorities: [KNOWN_1, KNOWN_2].filter(Boolean),
      };
      // quick visual breadcrumb in console
      // eslint-disable-next-line no-console
      console.log('[MSAL cfg]', (window as any).__lastMsalCfg);
    }
  }, []);

  const pca = useMemo(() => {
    // If critical config is missing, don’t create an instance
    if (!CLIENT_ID || !AUTHORITY) return null;

    const cfg: Configuration = {
      auth: {
        clientId: CLIENT_ID,
        authority: AUTHORITY,                    // e.g. https://.../{tenant}/{policy}/v2.0
        knownAuthorities: [KNOWN_1, KNOWN_2].filter(Boolean) as string[],
        redirectUri: REDIRECT_URI,
      },
      cache: {
        cacheLocation: 'localStorage',
        storeAuthStateInCookie: false,
      },
      system: {
        // keep defaults conservative
      },
    };
    return new PublicClientApplication(cfg);
  }, []);

  useEffect(() => {
    let unsubscribed = false;

    (async () => {
      // Hard guard: if misconfigured, render UI but block login (button will be shown but no-op)
      if (!pca) {
        setReady(true);
        return;
      }

      try {
        await pca.initialize();

        // Handle any pending redirects (no await loops)
        await pca.handleRedirectPromise().catch(() => { /* swallow */ });

        const accts = pca.getAllAccounts();
        setAccount(accts[0] ?? null);

        // Track account changes (interactive/login events)
        const cb = (msg: EventMessage) => {
          if (msg.eventType === EventType.LOGIN_SUCCESS || msg.eventType === EventType.ACQUIRE_TOKEN_SUCCESS) {
            const current = pca.getAllAccounts()[0] ?? null;
            setAccount(current);
          }
          if (msg.eventType === EventType.LOGOUT_SUCCESS) {
            setAccount(null);
          }
        };
        pca.addEventCallback(cb);

        if (!unsubscribed) setReady(true);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('MSAL init error:', err);
        if (!unsubscribed) setReady(true);
      }
    })();

    return () => {
      unsubscribed = true;
    };
  }, [pca]);

  const login = async () => {
    if (!pca) {
      // eslint-disable-next-line no-console
      console.warn('Login blocked: MSAL not initialized (check env vars).');
      return;
    }
    await pca.loginRedirect({
      redirectUri: REDIRECT_URI,
      // login request does not need API scopes; we only establish a session
      // (you can add openid/profile/email here if you want)
    });
  };

  const logout = async () => {
    if (!pca) return;
    await pca.logoutRedirect({ postLogoutRedirectUri: REDIRECT_URI });
  };

  const value: AuthContextValue = { ready, account, login, logout };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
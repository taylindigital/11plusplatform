'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
  type ReactElement,
} from 'react';
import {
  PublicClientApplication,
  LogLevel,
  type AccountInfo,
  type Configuration,
  type RedirectRequest,
  type SilentRequest,
} from '@azure/msal-browser';

/* ============================================================================
   Auth context
============================================================================ */

interface AuthContextValue {
  ready: boolean;
  msal: PublicClientApplication | null;
  account: AccountInfo | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  getToken: (scopeOverride?: string) => Promise<string>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <Providers>');
  return ctx;
}

/* ============================================================================
   Providers (MSAL bootstrap)
============================================================================ */

export default function Providers({ children }: { children: ReactNode }): ReactElement {
  const [msalApp, setMsalApp] = useState<PublicClientApplication | null>(null);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [ready, setReady] = useState(false);

  // Read NEXT_PUBLIC_* at build time (Next inlines these).
  const CLIENT_ID = process.env.NEXT_PUBLIC_CIAM_CLIENT_ID ?? '';
  const TENANT_ID = process.env.NEXT_PUBLIC_CIAM_TENANT_ID ?? '';
  const DOMAIN = process.env.NEXT_PUBLIC_CIAM_DOMAIN ?? '';
  const USER_FLOW = process.env.NEXT_PUBLIC_CIAM_USER_FLOW ?? 'SignUpSignIn';
  const REDIRECT_URI =
    process.env.NEXT_PUBLIC_REDIRECT_URI ??
    (typeof window !== 'undefined' ? `${window.location.origin}/` : '/');
  const POST_LOGOUT_REDIRECT_URI =
    process.env.NEXT_PUBLIC_POST_LOGOUT_REDIRECT_URI ?? REDIRECT_URI;
  const API_SCOPE = process.env.NEXT_PUBLIC_API_SCOPE ?? '';

  // CIAM/B2C authority format: https://{domain}/{tenantId}/{policy}/v2.0
  const AUTHORITY =
    DOMAIN && TENANT_ID ? `https://${DOMAIN}/${TENANT_ID}/${USER_FLOW}/v2.0` : undefined;

  // For B2C/CIAM you MUST set knownAuthorities to your CIAM/B2C domain
  const KNOWN_AUTHORITIES = DOMAIN ? [DOMAIN] : [];

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        // If critical pieces are missing, surface debug info and don’t crash
        if (!CLIENT_ID || !AUTHORITY) {
          if (typeof window !== 'undefined') {
            (window as unknown as Record<string, unknown>).__lastMsalCfg = {
              clientIdPresent: Boolean(CLIENT_ID),
              authority: AUTHORITY,
              knownAuthorities: KNOWN_AUTHORITIES,
              redirectUri: REDIRECT_URI,
              hasAuthorityMetadata: false,
              account: null,
            };
          }
          setReady(true);
          return;
        }

        const cfg: Configuration = {
          auth: {
            clientId: CLIENT_ID,
            authority: AUTHORITY,
            knownAuthorities: KNOWN_AUTHORITIES,
            redirectUri: REDIRECT_URI,
            postLogoutRedirectUri: POST_LOGOUT_REDIRECT_URI,
            // IMPORTANT: do NOT set "authorityMetadata" to a URL.
            // MSAL expects JSON content there, not a URL. Using a URL causes endpoint errors.
          },
          system: {
            loggerOptions: {
              logLevel: LogLevel.Error,
              loggerCallback: () => {
                /* no-op */
              },
            },
          },
          cache: {
            cacheLocation: 'sessionStorage',
            storeAuthStateInCookie: false,
          },
        };

        const app = new PublicClientApplication(cfg);

        // MSAL v3 requires initialize(); v2 does not have it. Guard safely without "any".
        const maybeInit =
          (app as unknown as Record<string, unknown>)['initialize'];
        if (typeof maybeInit === 'function') {
          await (maybeInit as () => Promise<void>)();
        }

        // Handle the redirect response (if any) and pick an account
        const result = await app.handleRedirectPromise();
        const active = (result?.account ?? app.getAllAccounts()[0]) || null;
        if (active) app.setActiveAccount(active);

        if (!cancelled) {
          setMsalApp(app);
          setAccount(active);
          setReady(true);

          if (typeof window !== 'undefined') {
            (window as unknown as Record<string, unknown>).msalInstance = app;
            (window as unknown as Record<string, unknown>).__lastMsalCfg = {
              authority: AUTHORITY,
              knownAuthorities: KNOWN_AUTHORITIES,
              clientIdPresent: Boolean(CLIENT_ID),
              hasAuthorityMetadata: false,
              account: active
                ? {
                    homeAccountId: active.homeAccountId,
                    username: active.username,
                  }
                : null,
              redirectUri: REDIRECT_URI,
            };
          }
        }
      } catch {
        // Don’t trap the app in “initializing” state on errors
        if (!cancelled) setReady(true);
      }
    }

    boot();
    return () => {
      cancelled = true;
    };
  }, [
    CLIENT_ID,
    AUTHORITY,
    KNOWN_AUTHORITIES,
    REDIRECT_URI,
    POST_LOGOUT_REDIRECT_URI,
  ]);

  const login = useMemo(() => {
    return async (): Promise<void> => {
      if (!msalApp) return;
      const req: RedirectRequest = {
        // Use OIDC scopes for login, acquire API token later.
        scopes: ['openid', 'profile', 'offline_access'],
        redirectUri: REDIRECT_URI,
      };
      await msalApp.loginRedirect(req);
    };
  }, [msalApp, REDIRECT_URI]);

  const logout = useMemo(() => {
    return async (): Promise<void> => {
      if (!msalApp) return;
      await msalApp.logoutRedirect({ postLogoutRedirectUri: POST_LOGOUT_REDIRECT_URI });
    };
  }, [msalApp, POST_LOGOUT_REDIRECT_URI]);

  const getToken = useMemo(() => {
    return async (scopeOverride?: string): Promise<string> => {
      if (!msalApp) throw new Error('MSAL not ready');
      const scopes = [scopeOverride ?? API_SCOPE].filter((s) => s && s.length) as string[];
      if (!scopes.length) throw new Error('Missing API scope');

      const acc =
        msalApp.getActiveAccount() ?? msalApp.getAllAccounts()[0] ?? undefined;
      if (!acc) throw new Error('No signed-in account');

      const req: SilentRequest = { account: acc, scopes };
      const res = await msalApp.acquireTokenSilent(req);
      return res.accessToken;
    };
  }, [msalApp, API_SCOPE]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      msal: msalApp,
      account,
      login,
      logout,
      getToken,
    }),
    [ready, msalApp, account, login, logout, getToken]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
'use client';

import React, {
  createContext,
  useCallback,
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
  type RedirectRequest,
} from '@azure/msal-browser';

//
// Auth context types
//
type AuthContextValue = {
  ready: boolean;
  msal?: PublicClientApplication;
  account?: AccountInfo;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  acquire: (scope: string) => Promise<string>;
};

const AuthContext = createContext<AuthContextValue>({
  ready: false,
  login: async () => {},
  logout: async () => {},
  acquire: async () => '',
});

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

//
// Helpers to read public env at runtime (from SWA-injected window.__env or from build-time process.env)
//
function readPublicEnv(key: string): string | undefined {
  if (typeof window !== 'undefined' && (window as unknown as { __env?: Record<string, string> }).__env) {
    const v = (window as unknown as { __env: Record<string, string> }).__env[key];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  const v = process.env[key];
  if (typeof v === 'string' && v.length > 0) return v;
  return undefined;
}

function buildMsalConfiguration(): {
  cfg: Configuration;
  redirectUri: string;
  apiScope: string;
} {
  const tenantId = readPublicEnv('NEXT_PUBLIC_CIAM_TENANT_ID') ?? '';
  const domain = readPublicEnv('NEXT_PUBLIC_CIAM_DOMAIN') ?? '';
  const userFlow = readPublicEnv('NEXT_PUBLIC_CIAM_USER_FLOW') ?? 'SignUpSignIn';
  const clientId = readPublicEnv('NEXT_PUBLIC_CIAM_CLIENT_ID') ?? '';
  const authorityBase =
    readPublicEnv('NEXT_PUBLIC_CIAM_AUTHORITY') ??
    (tenantId ? `https://${domain}/${tenantId}` : '');
  const metadataUrl = readPublicEnv('NEXT_PUBLIC_CIAM_METADATA_URL'); // optional, good to have
  const redirectUri =
    readPublicEnv('NEXT_PUBLIC_REDIRECT_URI') ?? (typeof window !== 'undefined' ? window.location.origin + '/' : '/');
  const apiScope = readPublicEnv('NEXT_PUBLIC_API_SCOPE') ?? '';

  const authority = authorityBase.replace(/\/+$/, '') + `/${userFlow}/v2.0`;

  // Known authorities: B2C/CIAM domains you trust
  const ka: string[] = [];
  if (domain) ka.push(domain);
  if (tenantId) ka.push(`${tenantId}.ciamlogin.com`);

  const cfg: Configuration = {
    auth: {
      clientId,
      authority,
      knownAuthorities: ka,
      authorityMetadata: metadataUrl,
      redirectUri,
      navigateToLoginRequestUrl: true,
    },
    cache: {
      cacheLocation: 'localStorage',
      storeAuthStateInCookie: false,
    },
  };

  return { cfg, redirectUri, apiScope };
}

//
// Provider
//
export default function Providers({ children }: { children: ReactNode }) {
  const [{ cfg, redirectUri, apiScope }] = useState(buildMsalConfiguration);
  const [msal, setMsal] = useState<PublicClientApplication | undefined>(undefined);
  const [account, setAccount] = useState<AccountInfo | undefined>(undefined);
  const [ready, setReady] = useState(false);

  // Initialize MSAL once
  useEffect(() => {
    const app = new PublicClientApplication(cfg);
    void app.initialize().then(() => {
      setMsal(app);

      // Complete any pending redirect flow
      app
        .handleRedirectPromise()
        .then((result) => {
          if (result && result.account) {
            setAccount(result.account);
          } else {
            const accts = app.getAllAccounts();
            if (accts.length > 0) setAccount(accts[0]);
          }
        })
        .finally(() => {
          setReady(true);
        });
    });
  }, [cfg]);

  const login = useCallback(async () => {
    if (!msal) return;
    const req: RedirectRequest = {
      scopes: apiScope ? [apiScope] : [],
      redirectUri,
    };
    await msal.loginRedirect(req);
  }, [msal, apiScope, redirectUri]);

  const logout = useCallback(async () => {
    if (!msal) return;
    await msal.logoutRedirect({ postLogoutRedirectUri: redirectUri });
  }, [msal, redirectUri]);

  const acquire = useCallback(
    async (scope: string) => {
      if (!msal) throw new Error('MSAL not ready');
      const accts = msal.getAllAccounts();
      if (accts.length === 0) throw new Error('No account');
      const { accessToken } = await msal.acquireTokenSilent({
        account: accts[0],
        scopes: [scope],
      });
      return accessToken;
    },
    [msal],
  );

  const value: AuthContextValue = useMemo(
    () => ({ ready, msal, account, login, logout, acquire }),
    [ready, msal, account, login, logout, acquire],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
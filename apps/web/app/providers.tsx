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

// Read public runtime env (SWA injects window.__env) or build-time process.env
function readPublicEnv(key: string): string | undefined {
  if (typeof window !== 'undefined') {
    const w = window as unknown as { __env?: Record<string, string> };
    if (w.__env && typeof w.__env[key] === 'string' && w.__env[key]) {
      return w.__env[key];
    }
  }
  const v = process.env[key];
  return typeof v === 'string' && v ? v : undefined;
}

function normalizeBase(urlLike: string): string {
  const trimmed = urlLike.trim();
  // If it doesn't start with http(s), prefix https://
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  // Drop trailing slashes
  return withProto.replace(/\/+$/, '');
}

function buildMsalConfiguration(): {
  cfg: Configuration;
  redirectUri: string;
  apiScope: string;
  authorityOk: boolean;
} {
  const tenantId = readPublicEnv('NEXT_PUBLIC_CIAM_TENANT_ID') ?? '';
  const domain = readPublicEnv('NEXT_PUBLIC_CIAM_DOMAIN') ?? '';
  const userFlow = readPublicEnv('NEXT_PUBLIC_CIAM_USER_FLOW') ?? 'SignUpSignIn';
  const clientId = readPublicEnv('NEXT_PUBLIC_CIAM_CLIENT_ID') ?? '';
  const providedAuthority = readPublicEnv('NEXT_PUBLIC_CIAM_AUTHORITY') ?? '';
  const metadataUrlRaw = readPublicEnv('NEXT_PUBLIC_CIAM_METADATA_URL'); // optional
  const redirectUri =
    readPublicEnv('NEXT_PUBLIC_REDIRECT_URI') ??
    (typeof window !== 'undefined' ? window.location.origin + '/' : '/');
  const apiScope = readPublicEnv('NEXT_PUBLIC_API_SCOPE') ?? '';

  // Build authority base
  let base = providedAuthority || (domain && tenantId ? `${domain}/${tenantId}` : '');
  if (base) {
    base = normalizeBase(base);
  }

  // Append /{userflow}/v2.0 exactly once
  let authority = '';
  if (base) {
    const endsWithFlow =
      new RegExp(`/${userFlow}/v2\\.0$`, 'i').test(base) ||
      /\/v2\.0$/i.test(base); // if someone already appended v2.0
    authority = endsWithFlow ? base : `${base}/${userFlow}/v2.0`;
  }

  const authorityOk = /^https?:\/\/[^/]+\/.+\/v2\.0$/i.test(authority);

  const cfg: Configuration = {
    auth: {
      clientId,
      authority: authorityOk ? authority : undefined, // avoid passing a bad URL
      knownAuthorities: [
        ...(domain ? [domain] : []),
        ...(tenantId ? [`${tenantId}.ciamlogin.com`] : []),
      ],
      authorityMetadata: (metadataUrlRaw || '').trim() || undefined,
      redirectUri,
      navigateToLoginRequestUrl: true,
    },
    cache: {
      cacheLocation: 'localStorage',
      storeAuthStateInCookie: false,
    },
  };

  // Helpful console output once per build
  if (typeof window !== 'undefined') {
    // eslint-disable-next-line no-console
    console.log('[MSAL cfg]', {
      clientIdPresent: !!clientId,
      authority,
      authorityOk,
      metadataUrl: cfg.auth.authorityMetadata,
      redirectUri,
      apiScope,
    });
  }

  return { cfg, redirectUri, apiScope, authorityOk };
}

export default function Providers({ children }: { children: ReactNode }) {
  const [{ cfg, redirectUri, apiScope, authorityOk }] = useState(buildMsalConfiguration);
  const [msal, setMsal] = useState<PublicClientApplication | undefined>(undefined);
  const [account, setAccount] = useState<AccountInfo | undefined>(undefined);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const app = new PublicClientApplication(cfg);
    void app.initialize().then(() => {
      setMsal(app);
      app
        .handleRedirectPromise()
        .then((result) => {
          if (result?.account) {
            setAccount(result.account);
          } else {
            const accts = app.getAllAccounts();
            if (accts.length > 0) setAccount(accts[0]);
          }
        })
        .finally(() => setReady(true));
    });
  }, [cfg]);

  const login = useCallback(async () => {
    if (!msal) return;
    if (!authorityOk || !cfg.auth.clientId) {
      // eslint-disable-next-line no-console
      console.error('MSAL login blocked: invalid config', {
        authority: cfg.auth.authority,
        clientIdPresent: !!cfg.auth.clientId,
      });
      alert('Sign-in is not configured correctly. Check authority/clientId.');
      return;
    }
    const req: RedirectRequest = {
      scopes: apiScope ? [apiScope] : [],
      redirectUri,
    };
    await msal.loginRedirect(req);
  }, [msal, cfg.auth.authority, cfg.auth.clientId, apiScope, redirectUri, authorityOk]);

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
'use client';

import type { ReactNode } from 'react';
import {
  PublicClientApplication,
  type AccountInfo,
  type Configuration,
  type RedirectRequest,
  type SilentRequest,
} from '@azure/msal-browser';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

type AuthCtx = {
  msal: PublicClientApplication | null;
  account: AccountInfo | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthCtx>({
  msal: null,
  account: null,
  login: async () => {},
  logout: async () => {},
});

function buildAuthority(tenantId: string, userFlow: string, domain: string) {
  // Example: https://11plusdevuks.ciamlogin.com/{tenant}/{policy}/v2.0
  return `https://${domain}/${tenantId}/${userFlow}/v2.0`;
}

function buildMetadataUrl(tenantId: string, userFlow: string, domain: string) {
  // Example: https://11plusdevuks.ciamlogin.com/{tenant}/v2.0/.well-known/openid-configuration?p=SignUpSignIn
  return `https://${domain}/${tenantId}/v2.0/.well-known/openid-configuration?p=${userFlow}`;
}

export default function Providers({ children }: { children: ReactNode }) {
  const [msal, setMsal] = useState<PublicClientApplication | null>(null);
  const [account, setAccount] = useState<AccountInfo | null>(null);

  const cfgPieces = useMemo(() => {
    const domain = process.env.NEXT_PUBLIC_CIAM_DOMAIN ?? '';
    const tenantId = process.env.NEXT_PUBLIC_CIAM_TENANT_ID ?? '';
    const userFlow = process.env.NEXT_PUBLIC_CIAM_USER_FLOW ?? 'SignUpSignIn';
    const clientId = process.env.NEXT_PUBLIC_CIAM_CLIENT_ID ?? '';
    const redirectUri = process.env.NEXT_PUBLIC_REDIRECT_URI ?? '/';
    const postLogoutRedirectUri =
      process.env.NEXT_PUBLIC_POST_LOGOUT_REDIRECT_URI ?? redirectUri;

    const authority = buildAuthority(tenantId, userFlow, domain);
    const metadataUrl = buildMetadataUrl(tenantId, userFlow, domain);

    return {
      domain,
      tenantId,
      userFlow,
      clientId,
      authority,
      metadataUrl,
      redirectUri,
      postLogoutRedirectUri,
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const init = async () => {
      let authorityMetadata: string | undefined;

      // Preload authority metadata to avoid CORS / resolution flakiness.
      try {
        const res = await fetch(cfgPieces.metadataUrl, { cache: 'no-store', mode: 'cors' });
        if (res.ok) authorityMetadata = await res.text();
      } catch {
        // ignore; MSAL will fetch on its own as a fallback
      }

      const config: Configuration = {
        auth: {
          clientId: cfgPieces.clientId,
          authority: cfgPieces.authority,
          knownAuthorities: [cfgPieces.domain, `${cfgPieces.tenantId}.ciamlogin.com`],
          ...(authorityMetadata ? { authorityMetadata } : {}),
          redirectUri: cfgPieces.redirectUri,
          postLogoutRedirectUri: cfgPieces.postLogoutRedirectUri,
        },
        cache: { cacheLocation: 'localStorage' },
      };

      // Debug surface
      window.__lastMsalCfg = {
        authority: config.auth.authority,
        metadataUrl: cfgPieces.metadataUrl,
        knownAuthorities: config.auth.knownAuthorities ?? [],
        clientIdPresent: Boolean(config.auth.clientId),
        hasAuthorityMetadata: Boolean(authorityMetadata),
        account: null,
      };

      const instance = new PublicClientApplication(config);
      await instance.initialize();

      // Handle possible redirect response
      try {
        const result = await instance.handleRedirectPromise();
        if (result?.account) setAccount(result.account);
      } catch {
        // swallow to avoid breaking the page on startup
      }

      const accs = instance.getAllAccounts();
      if (accs.length > 0) setAccount(accs[0]);

      window.msalInstance = instance;
      if (window.__lastMsalCfg) {
        window.__lastMsalCfg.account = accs[0]
          ? { username: accs[0].username, homeAccountId: accs[0].homeAccountId }
          : null;
      }

      setMsal(instance);
    };

    void init();
  }, [cfgPieces]);

  const login = async () => {
    if (!msal) return;
    const req: RedirectRequest = {
      // Scope can be empty for login; we’ll just create a session.
      redirectUri: cfgPieces.redirectUri,
    };
    await msal.loginRedirect(req);
  };

  const logout = async () => {
    if (!msal) return;
    await msal.logoutRedirect({
      postLogoutRedirectUri: cfgPieces.postLogoutRedirectUri,
    });
    setAccount(null);
  };

  return (
    <AuthContext.Provider value={{ msal, account, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
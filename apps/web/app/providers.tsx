'use client';

import { ReactNode, useEffect, useMemo } from 'react';
import { MsalProvider } from '@azure/msal-react';
import { PublicClientApplication, type Configuration, LogLevel } from '@azure/msal-browser';

// ---- Strongly type the globals we want to expose (no `any`)
declare global {
  interface Window {
    msalInstance?: PublicClientApplication;
    __env?: {
      NEXT_PUBLIC_API_SCOPE?: string;
    };
  }
}

// ---- Build MSAL config from env (throw early if something is missing)
const cfgFromEnv = () => {
  const clientId = process.env.NEXT_PUBLIC_CIAM_CLIENT_ID;
  const authority = process.env.NEXT_PUBLIC_CIAM_AUTHORITY;
  const domain = process.env.NEXT_PUBLIC_CIAM_DOMAIN;
  const redirectUri = process.env.NEXT_PUBLIC_REDIRECT_URI;
  const postLogoutRedirectUri = process.env.NEXT_PUBLIC_POST_LOGOUT_REDIRECT_URI;

  if (!clientId || !authority || !domain || !redirectUri || !postLogoutRedirectUri) {
    // eslint-disable-next-line no-console
    console.error('Missing MSAL envs', {
      clientId: !!clientId,
      authority: !!authority,
      domain: !!domain,
      redirectUri: !!redirectUri,
      postLogoutRedirectUri: !!postLogoutRedirectUri,
    });
  }

  const msalConfig: Configuration = {
    auth: {
      clientId: clientId ?? '',
      authority: authority ?? '',
      knownAuthorities: domain ? [domain] : [],
      redirectUri: redirectUri ?? '/',
      postLogoutRedirectUri: postLogoutRedirectUri ?? '/',
    },
    system: {
      loggerOptions: {
        loggerCallback: () => {},
        piiLoggingEnabled: false,
        logLevel: LogLevel.Error,
      },
    },
  };

  return msalConfig;
};

export default function Providers({ children }: { children: ReactNode }) {
  const msalConfig = useMemo(cfgFromEnv, []);
  const pca = useMemo(() => new PublicClientApplication(msalConfig), [msalConfig]);

  useEffect(() => {
    let mounted = true;

    pca.initialize().then(() => {
      if (!mounted) return;

      const accounts = pca.getAllAccounts();
      if (accounts.length && !pca.getActiveAccount()) {
        pca.setActiveAccount(accounts[0]);
      }

      // Expose for console diagnostics (typed via `declare global` above)
      window.msalInstance = pca;
      window.__env = {
        ...(window.__env ?? {}),
        NEXT_PUBLIC_API_SCOPE: process.env.NEXT_PUBLIC_API_SCOPE,
      };
    });

    return () => {
      mounted = false;
    };
  }, [pca]);

  return <MsalProvider instance={pca}>{children}</MsalProvider>;
}
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
  const clientId = process.env.NEXT_PUBLIC_CIAM_CLIENT_ID ?? '';
  const domain = process.env.NEXT_PUBLIC_CIAM_DOMAIN ?? ''; // e.g. 11plusdevuks.ciamlogin.com
  const baseAuthority =
    process.env.NEXT_PUBLIC_CIAM_AUTHORITY // should be base without policy
      ?? '';
  const metadataUrl =
    process.env.NEXT_PUBLIC_CIAM_METADATA_URL // must include ?p=SignUpSignIn
      ?? '';

  const redirectUri = process.env.NEXT_PUBLIC_REDIRECT_URI ?? '/';
  const postLogoutRedirectUri =
    process.env.NEXT_PUBLIC_POST_LOGOUT_REDIRECT_URI ?? '/';

  const msalConfig: Configuration = {
    auth: {
      clientId,
      authority: baseAuthority,                 // NO policy here
      knownAuthorities: domain ? [domain] : [], // your CIAM domain
      redirectUri,
      postLogoutRedirectUri,
      authorityMetadata: metadataUrl || undefined, // pin discovery to policy URL with ?p=
    },
    system: {
      loggerOptions: { loggerCallback: () => {}, piiLoggingEnabled: false, logLevel: LogLevel.Error },
    },
  };

  // quick sanity log
  if (!clientId || !baseAuthority || !domain || !metadataUrl) {
    // eslint-disable-next-line no-console
    console.error('MSAL envs missing/invalid', { clientId: !!clientId, baseAuthority, domain, metadataUrl });
  }

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
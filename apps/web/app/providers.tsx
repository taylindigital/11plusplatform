'use client';

import { useMemo } from 'react';
import { MsalProvider } from '@azure/msal-react';
import { PublicClientApplication, type Configuration, LogLevel } from '@azure/msal-browser';

function getMsalConfig(): Configuration {
  const cfg: Configuration = {
    auth: {
      clientId: process.env.NEXT_PUBLIC_CIAM_CLIENT_ID ?? '',
      authority: process.env.NEXT_PUBLIC_CIAM_AUTHORITY ?? '',
      knownAuthorities: [process.env.NEXT_PUBLIC_CIAM_DOMAIN ?? ''],
      redirectUri: process.env.NEXT_PUBLIC_REDIRECT_URI ?? '/',
      postLogoutRedirectUri: process.env.NEXT_PUBLIC_POST_LOGOUT_REDIRECT_URI ?? '/',
    },
    system: {
      loggerOptions: { logLevel: LogLevel.Error, loggerCallback: () => {} },
    },
  };
  // quick runtime guard to avoid silent failures
  if (!cfg.auth.clientId || !cfg.auth.authority || !cfg.auth.knownAuthorities[0]) {
    // eslint-disable-next-line no-console
    console.error('MSAL config missing envs', cfg);
  }
  return cfg;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  const pca = useMemo(() => {
    // ensure client-only
    if (typeof window === 'undefined') return undefined as unknown as PublicClientApplication;
    return new PublicClientApplication(getMsalConfig());
  }, []);
  if (!pca) return <>{children}</>; // avoids SSR mismatch
  return <MsalProvider instance={pca}>{children}</MsalProvider>;
}

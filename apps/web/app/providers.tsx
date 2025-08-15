'use client';

import { useMemo } from 'react';
import { MsalProvider } from '@azure/msal-react';
import { PublicClientApplication, type Configuration, LogLevel } from '@azure/msal-browser';

const knownAuthorities: string[] = process.env.NEXT_PUBLIC_CIAM_DOMAIN
  ? [process.env.NEXT_PUBLIC_CIAM_DOMAIN]
  : []; // always an array so TS won't complain

const msalConfig: Configuration = {
  auth: {
    clientId: process.env.NEXT_PUBLIC_CIAM_CLIENT_ID || '',
    authority: process.env.NEXT_PUBLIC_CIAM_AUTHORITY || '',
    knownAuthorities, // <- typed string[]
    redirectUri: process.env.NEXT_PUBLIC_REDIRECT_URI || '/',
    postLogoutRedirectUri: process.env.NEXT_PUBLIC_POST_LOGOUT_REDIRECT_URI || '/',
  },
  system: { loggerOptions: { logLevel: LogLevel.Error, loggerCallback: () => {} } },
};

export default function Providers({ children }: { children: React.ReactNode }) {
  const pca = useMemo(() => {
    if (typeof window === 'undefined') return undefined as unknown as PublicClientApplication;
    // quick guard so we notice missing envs at runtime
    if (!msalConfig.auth.clientId || !msalConfig.auth.authority || msalConfig.auth.knownAuthorities.length === 0) {
      // eslint-disable-next-line no-console
      console.error('MSAL config missing envs', {
        clientId: msalConfig.auth.clientId,
        authority: msalConfig.auth.authority,
        knownAuthorities: msalConfig.auth.knownAuthorities,
      });
    }
    return new PublicClientApplication(msalConfig);
  }, []);

  if (!pca) return <>{children}</>;
  return <MsalProvider instance={pca}>{children}</MsalProvider>;
}

'use client';

import { useMemo } from 'react';
import { MsalProvider } from '@azure/msal-react';
import { PublicClientApplication, type Configuration, LogLevel } from '@azure/msal-browser';

const msalConfig: Configuration = {
  auth: {
    clientId: process.env.NEXT_PUBLIC_CIAM_CLIENT_ID || '',
    authority: process.env.NEXT_PUBLIC_CIAM_AUTHORITY || '',
    knownAuthorities: process.env.NEXT_PUBLIC_CIAM_DOMAIN ? [process.env.NEXT_PUBLIC_CIAM_DOMAIN] : [],
    // 👇 pin the well-known metadata so MSAL never guesses the wrong URL
    authorityMetadata: process.env.NEXT_PUBLIC_CIAM_METADATA_URL,
    redirectUri: process.env.NEXT_PUBLIC_REDIRECT_URI || '/',
    postLogoutRedirectUri: process.env.NEXT_PUBLIC_POST_LOGOUT_REDIRECT_URI || '/',
    navigateToLoginRequestUrl: false,
  },
  system: { loggerOptions: { logLevel: LogLevel.Error, loggerCallback: () => {} } },
};

export default function Providers({ children }: { children: React.ReactNode }) {
  const pca = useMemo(() => {
    if (typeof window === 'undefined') return undefined as unknown as PublicClientApplication;
    return new PublicClientApplication(msalConfig);
  }, []);
  if (!pca) return <>{children}</>;
  return <MsalProvider instance={pca}>{children}</MsalProvider>;
}
'use client';

import { useMemo } from 'react';
import { MsalProvider } from '@azure/msal-react';
import { PublicClientApplication, type Configuration, LogLevel, ProtocolMode } from '@azure/msal-browser';

const known = [
  '11plusdevuks.ciamlogin.com',
  '662ecf18-5239-4e7f-b4bd-a0d8e32d1026.ciamlogin.com', // issuer host from metadata
].filter(Boolean);

const msalConfig: Configuration = {
  auth: {
    clientId: process.env.NEXT_PUBLIC_CIAM_CLIENT_ID || '',
    authority: process.env.NEXT_PUBLIC_CIAM_AUTHORITY || '',
    knownAuthorities: known, // trust both hosts
    authorityMetadata: process.env.NEXT_PUBLIC_CIAM_METADATA_URL, // pinned well-known URL
    redirectUri: process.env.NEXT_PUBLIC_REDIRECT_URI || '/',
    postLogoutRedirectUri: process.env.NEXT_PUBLIC_POST_LOGOUT_REDIRECT_URI || '/',
    navigateToLoginRequestUrl: false,
  },
  system: { loggerOptions: { logLevel: LogLevel.Error, loggerCallback: () => {} } },
  // 👇 B2C/CIAM needs OIDC mode or discovery can fail
  authOptions: undefined, // keeps types happy in some editors
  cache: undefined,
  telemetry: undefined,
  cryptoInterfaces: undefined,
  framework: {
    // no-op; keeps shape stable
  },
  // MSAL v3: set protocolMode at top level (older typings: in system / auth—this works in browser lib)
  // @ts-expect-error allow property for browser lib
  protocolMode: ProtocolMode.OIDC,
};

export default function Providers({ children }: { children: React.ReactNode }) {
  const pca = useMemo(() => {
    if (typeof window === 'undefined') return undefined as unknown as PublicClientApplication;
    return new PublicClientApplication(msalConfig);
  }, []);
  if (!pca) return <>{children}</>;
  return <MsalProvider instance={pca}>{children}</MsalProvider>;
}
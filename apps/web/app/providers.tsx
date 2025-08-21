'use client';

import { ReactNode, useEffect, useMemo } from 'react';
import { MsalProvider } from '@azure/msal-react';
import { PublicClientApplication, type Configuration, LogLevel } from '@azure/msal-browser';

const msalConfig: Configuration = {
  auth: {
    clientId: process.env.NEXT_PUBLIC_CIAM_CLIENT_ID!,
    authority: process.env.NEXT_PUBLIC_CIAM_AUTHORITY!, // e.g. https://11plusdevuks.ciamlogin.com/…/SignUpSignIn/v2.0/
    knownAuthorities: [process.env.NEXT_PUBLIC_CIAM_DOMAIN!], // e.g. 11plusdevuks.ciamlogin.com
    redirectUri: process.env.NEXT_PUBLIC_REDIRECT_URI!,
    postLogoutRedirectUri: process.env.NEXT_PUBLIC_POST_LOGOUT_REDIRECT_URI!,
  },
  system: {
    loggerOptions: { loggerCallback: () => {}, piiLoggingEnabled: false, logLevel: LogLevel.Error },
  },
};

export default function Providers({ children }: { children: ReactNode }) {
  const pca = useMemo(() => new PublicClientApplication(msalConfig), []);

  useEffect(() => {
    // Initialize MSAL, set an active account if one exists,
    // and expose the instance to window for console diagnostics.
    pca.initialize().then(() => {
      const accounts = pca.getAllAccounts();
      if (accounts.length && !pca.getActiveAccount()) {
        pca.setActiveAccount(accounts[0]);
      }
      (globalThis as any).msalInstance = pca; // <-- key line
      // Optional: surface the API scope for console tests
      (globalThis as any).__env = {
        ...(globalThis as any).__env,
        NEXT_PUBLIC_API_SCOPE: process.env.NEXT_PUBLIC_API_SCOPE,
      };
    });
  }, [pca]);

  return <MsalProvider instance={pca}>{children}</MsalProvider>;
}
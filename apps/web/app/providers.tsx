'use client';

import { MsalProvider } from '@azure/msal-react';
import { PublicClientApplication, Configuration, LogLevel } from '@azure/msal-browser';

const msalConfig: Configuration = {
  auth: {
    clientId: process.env.NEXT_PUBLIC_CIAM_CLIENT_ID!,
    authority: process.env.NEXT_PUBLIC_CIAM_AUTHORITY!, // https://<subdomain>.ciamlogin.com/<tenantId>/<flow>/v2.0
    knownAuthorities: [process.env.NEXT_PUBLIC_CIAM_DOMAIN!], // <subdomain>.ciamlogin.com
    redirectUri: process.env.NEXT_PUBLIC_REDIRECT_URI!,
    postLogoutRedirectUri: process.env.NEXT_PUBLIC_POST_LOGOUT_REDIRECT_URI!,
  },
  system: {
    loggerOptions: {
      logLevel: LogLevel.Error,
      loggerCallback: () => {},
    },
  },
};

const pca = new PublicClientApplication(msalConfig);

export default function Providers({ children }: { children: React.ReactNode }) {
  return <MsalProvider instance={pca}>{children}</MsalProvider>;
}

'use client';
import { ReactNode, useMemo } from 'react';
import { PublicClientApplication, type Configuration, LogLevel } from '@azure/msal-browser';
import { MsalProvider } from '@azure/msal-react';

type Props = { children: ReactNode };

const buildMsalConfig = (): Configuration => {
  const clientId = process.env.NEXT_PUBLIC_CIAM_CLIENT_ID ?? '';
  const domain = process.env.NEXT_PUBLIC_CIAM_DOMAIN ?? ''; // 11plusdevuks.ciamlogin.com
  const authority = (process.env.NEXT_PUBLIC_CIAM_AUTHORITY ?? '').replace(/\/+$/, ''); // NO policy here
  const metadataUrl = (process.env.NEXT_PUBLIC_CIAM_METADATA_URL ?? '').replace(/\/+$/, ''); // must have ?p=SignUpSignIn
  const redirectUri = process.env.NEXT_PUBLIC_REDIRECT_URI ?? '/';
  const postLogoutRedirectUri = process.env.NEXT_PUBLIC_POST_LOGOUT_REDIRECT_URI ?? '/';

  // Secondary host sometimes appears as issuer in metadata (tenantId host)
  const tenantId = process.env.NEXT_PUBLIC_CIAM_TENANT_ID ?? '';
  const issuerHost = tenantId ? `${tenantId}.ciamlogin.com` : undefined;

  const cfg: Configuration = {
    auth: {
      clientId,
      authority,                       // base tenant authority (no policy)
      knownAuthorities: issuerHost ? [domain, issuerHost] : [domain],
      authorityMetadata: metadataUrl,  // pin discovery to ?p=SignUpSignIn
      redirectUri,
      postLogoutRedirectUri,
    },
    system: {
      loggerOptions: {
        loggerCallback: () => {},
        piiLoggingEnabled: false,
        logLevel: LogLevel.Error,
      },
    },
    cache: {
      cacheLocation: 'localStorage',
      storeAuthStateInCookie: false,
    },
  };

  if (typeof window !== 'undefined') {
    // one-time sanity log (short + safe)
    // eslint-disable-next-line no-console
    console.log('[MSAL cfg]', {
      clientId: !!clientId,
      authority,
      metadataUrl,
      knownAuthorities: cfg.auth.knownAuthorities,
    });
  }

  return cfg;
};

export default function Providers({ children }: Props) {
  const pca = useMemo(() => new PublicClientApplication(buildMsalConfig()), []);
  return <MsalProvider instance={pca}>{children}</MsalProvider>;
}
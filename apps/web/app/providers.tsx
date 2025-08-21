'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { MsalProvider } from '@azure/msal-react';
import {
  PublicClientApplication,
  type Configuration,
  LogLevel,
} from '@azure/msal-browser';

type OidcMetadata = Record<string, unknown>;

const clientId = process.env.NEXT_PUBLIC_CIAM_CLIENT_ID as string;
const authority = process.env.NEXT_PUBLIC_CIAM_AUTHORITY as string; // e.g. https://<sub>.ciamlogin.com/<tenantId>/<policy>/v2.0
const knownAuthorities = [
  process.env.NEXT_PUBLIC_CIAM_DOMAIN as string,            // e.g. 11plusdevuks.ciamlogin.com
  `${process.env.NEXT_PUBLIC_CIAM_TENANT_ID}.ciamlogin.com` // safety: <tenantId>.ciamlogin.com
].filter(Boolean);

const metadataUrl = process.env.NEXT_PUBLIC_CIAM_METADATA_URL as string; // e.g. .../.well-known/openid-configuration?p=SignUpSignIn

function baseConfig(): Configuration {
  return {
    auth: {
      clientId,
      authority,
      knownAuthorities,
      navigateToLoginRequestUrl: false,
    },
    cache: {
      cacheLocation: 'sessionStorage',
      storeAuthStateInCookie: false,
    },
    system: {
      loggerOptions: {
        loggerCallback: (level, message) => {
          if (level === LogLevel.Error) console.error('[MSAL]', message);
        },
        logLevel: LogLevel.Error,
      },
    },
  };
}

export default function Providers({ children }: { children: React.ReactNode }) {
  const [authorityMetadata, setAuthorityMetadata] = useState<string | null>(null);
  const [pca, setPca] = useState<PublicClientApplication | null>(null);

  // 1) Fetch the metadata JSON once and stringify it for MSAL
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const resp = await fetch(metadataUrl, { cache: 'no-store', mode: 'cors' });
        if (!resp.ok) throw new Error(`metadata ${resp.status}`);
        const json: OidcMetadata = await resp.json();
        if (!cancelled) setAuthorityMetadata(JSON.stringify(json));
      } catch (e) {
        console.error('[MSAL] metadata fetch failed:', e);
        if (!cancelled) setAuthorityMetadata(null);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  // 2) Build the final config (inject authorityMetadata when we have it)
  const cfg: Configuration | null = useMemo(() => {
    if (!clientId || !authority || knownAuthorities.length === 0) {
      console.error('[MSAL] missing envs', { clientId, authority, knownAuthorities });
      return null;
    }
    const base = baseConfig();
    const auth = authorityMetadata ? { ...base.auth, authorityMetadata } : base.auth;
    const finalCfg: Configuration = { ...base, auth };
// --- normalize MSAL auth values so they're definitely strings/arrays
const tenantId = process.env.NEXT_PUBLIC_CIAM_TENANT_ID || '<your-tenant-id>';
const userFlow = process.env.NEXT_PUBLIC_CIAM_USER_FLOW || 'SignUpSignIn';
const tenantSub = process.env.NEXT_PUBLIC_CIAM_TENANT_SUBDOMAIN || '11plusdevuks';
const tenantDomain = `${tenantSub}.ciamlogin.com`;

const computedAuthority = `https://${tenantDomain}/${tenantId}/${userFlow}/v2.0`;
const computedKnownAuthorities = [tenantDomain, `${tenantId}.ciamlogin.com`];

// Ensure non‑undefined values at runtime
finalCfg.auth.authority = finalCfg.auth.authority ?? computedAuthority;
finalCfg.auth.knownAuthorities = finalCfg.auth.knownAuthorities ?? computedKnownAuthorities;
    // Expose what the bundle is actually using (handy for debugging)
    window.__lastMsalCfg = {
      clientId: finalCfg.auth.clientId,
      authority: finalCfg.auth.authority,
      knownAuthorities: finalCfg.auth.knownAuthorities,
      metadataUrl,
      hasAuthorityMetadata: Boolean(authorityMetadata),
    };
    console.log('[MSAL cfg]', window.__lastMsalCfg);

    return finalCfg;
  }, [authorityMetadata]);

  // 3) Create and initialize PCA once we have a config
  useEffect(() => {
    if (!cfg) return;
    const instance = new PublicClientApplication(cfg);
    instance.initialize().then(() => setPca(instance)).catch(err => {
      console.error('[MSAL] initialize failed', err);
      setPca(null);
    });
  }, [cfg]);

  if (!pca) {
    // Optional: small skeleton while MSAL/metadata loads
    return <div className="p-4 text-sm text-gray-600">Loading authentication…</div>;
  }

  return <MsalProvider instance={pca}>{children}</MsalProvider>;
}
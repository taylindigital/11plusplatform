'use client';

import { ReactNode, useEffect, useMemo } from 'react';
import { MsalProvider } from '@azure/msal-react';
import { PublicClientApplication, type Configuration, LogLevel } from '@azure/msal-browser';
import { ProtocolMode } from '@azure/msal-common';

// ---- Your tenant specifics (from your working discovery) ----
const TENANT_ID = '662ecf18-5239-4e7f-b4bd-a0d8e32d1026';
const SUBDOMAIN = '11plusdevuks';
const FLOW = 'SignUpSignIn';

// Pin the exact OIDC metadata as JSON so MSAL doesn't try to discover it.
const AUTHORITY_METADATA = JSON.stringify({
  token_endpoint: `https://${SUBDOMAIN}.ciamlogin.com/${TENANT_ID}/oauth2/v2.0/token`,
  token_endpoint_auth_methods_supported: [
    'client_secret_post',
    'private_key_jwt',
    'client_secret_basic',
  ],
  jwks_uri: `https://${SUBDOMAIN}.ciamlogin.com/${TENANT_ID}/discovery/v2.0/keys`,
  response_modes_supported: ['query', 'fragment', 'form_post'],
  subject_types_supported: ['pairwise'],
  id_token_signing_alg_values_supported: ['RS256'],
  response_types_supported: ['code', 'id_token', 'code id_token', 'id_token token'],
  scopes_supported: ['openid', 'profile', 'email', 'offline_access'],
  issuer: `https://${TENANT_ID}.ciamlogin.com/${TENANT_ID}/v2.0`,
  request_uri_parameter_supported: false,
  userinfo_endpoint: 'https://graph.microsoft.com/oidc/userinfo',
  authorization_endpoint: `https://${SUBDOMAIN}.ciamlogin.com/${TENANT_ID}/oauth2/v2.0/authorize`,
  device_authorization_endpoint: `https://${SUBDOMAIN}.ciamlogin.com/${TENANT_ID}/oauth2/v2.0/devicecode`,
  http_logout_supported: true,
  frontchannel_logout_supported: true,
  end_session_endpoint: `https://${SUBDOMAIN}.ciamlogin.com/${TENANT_ID}/oauth2/v2.0/logout`,
  claims_supported: [
    'sub','iss','cloud_instance_name','cloud_instance_host_name','cloud_graph_host_name',
    'msgraph_host','aud','exp','iat','auth_time','acr','nonce','preferred_username',
    'name','tid','ver','at_hash','c_hash','email'
  ],
  kerberos_endpoint: `https://${SUBDOMAIN}.ciamlogin.com/${TENANT_ID}/kerberos`,
  tenant_region_scope: 'EU',
  cloud_instance_name: 'microsoftonline.com',
  cloud_graph_host_name: 'graph.windows.net',
  msgraph_host: 'graph.microsoft.com',
  rbac_url: 'https://pas.windows.net',
});

const knownAuthorities = [`${SUBDOMAIN}.ciamlogin.com`];

// Standard CIAM/B2C-style authority (with flow in path)
const AUTHORITY = `https://${SUBDOMAIN}.ciamlogin.com/${TENANT_ID}/${FLOW}/v2.0`;

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
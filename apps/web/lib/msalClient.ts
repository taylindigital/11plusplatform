'use client';

import {
  PublicClientApplication,
  type AccountInfo,
} from '@azure/msal-browser';

let instance: PublicClientApplication | null = null;
let readyPromise: Promise<void> | null = null;

function buildAuthority(): string {
  // Example envs:
  // NEXT_PUBLIC_CIAM_AUTHORITY = "https://11plusdevuks.ciamlogin.com/662ecf18-5239-4e7f-b4bd-a0d8e32d1026/v2.0"
  // NEXT_PUBLIC_CIAM_USER_FLOW = "SignUpSignIn"
  const base = (process.env.NEXT_PUBLIC_CIAM_AUTHORITY ?? '').replace(/\/+$/, '');
  const userFlow = process.env.NEXT_PUBLIC_CIAM_USER_FLOW ?? 'SignUpSignIn';

  if (!base) throw new Error('Missing NEXT_PUBLIC_CIAM_AUTHORITY');

  // If base ends with /v2.0, move it AFTER the user flow:
  // - from: ".../<tenant>/v2.0"
  // - to:   ".../<tenant>/<userFlow>/v2.0"
  const v2 = /\/v2\.0$/i;
  if (v2.test(base)) {
    const withoutV2 = base.replace(v2, '');
    return `${withoutV2}/${userFlow}/v2.0`;
  }

  // If base did not include v2.0, append correctly.
  return `${base}/${userFlow}/v2.0`;
}

/** Build the singleton (do not use it until ensureMsalReady() resolves). */
function createMsal(): PublicClientApplication {
  if (typeof window === 'undefined') {
    throw new Error('MSAL can only be used in the browser');
  }

  const clientId = process.env.NEXT_PUBLIC_CIAM_CLIENT_ID ?? '';
  const authority = buildAuthority();
  const redirectUri = process.env.NEXT_PUBLIC_REDIRECT_URI ?? window.location.origin;

  // Domain host (e.g. "11plusdevuks.ciamlogin.com")
  const knownDomain = process.env.NEXT_PUBLIC_CIAM_DOMAIN ?? '';
  const knownAuthorities = knownDomain ? [knownDomain] : [];

  // Log once for sanity
  // eslint-disable-next-line no-console
  console.log('[MSAL auth cfg]', { clientIdPresent: Boolean(clientId), authority, knownAuthorities, redirectUri });

  return new PublicClientApplication({
    auth: { clientId, authority, redirectUri, knownAuthorities },
  });
}

/** Get (or create) the singleton — might not be initialized yet. */
export function getMsal(): PublicClientApplication {
  if (!instance) {
    instance = createMsal();
    (window as Window & { msalInstance?: PublicClientApplication }).msalInstance = instance;
  }
  return instance;
}

/** Ensure MSAL v3 is initialized and the active account is set. */
export async function ensureMsalReady(): Promise<PublicClientApplication> {
  const msal = getMsal();

  if (!readyPromise) {
    readyPromise = (async () => {
      await msal.initialize(); // v3 requirement

      try {
        const result = await msal.handleRedirectPromise();
        if (result?.account) {
          msal.setActiveAccount(result.account);
        } else {
          const existing = msal.getAllAccounts()[0];
          if (existing) msal.setActiveAccount(existing);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('MSAL redirect error', err);
      }
    })();
  }

  await readyPromise;
  return msal;
}

export async function getActiveAccount(): Promise<AccountInfo | null> {
  const msal = await ensureMsalReady();
  let acc = msal.getActiveAccount();
  if (acc) return acc;
  acc = msal.getAllAccounts()[0] ?? null;
  if (acc) msal.setActiveAccount(acc);
  return acc;
}

export async function getApiToken(): Promise<string> {
  const msal = await ensureMsalReady();
  const account = await getActiveAccount();
  if (!account) throw new Error('Not signed in');

  const scope =
    process.env.NEXT_PUBLIC_API_SCOPE ??
    'api://api-11plusplatform-dev/access_as_user';

  const { accessToken } = await msal.acquireTokenSilent({
    account,
    scopes: [scope],
  });

  return accessToken;
}

export async function login(): Promise<void> {
  const msal = await ensureMsalReady();
  const redirectUri = process.env.NEXT_PUBLIC_REDIRECT_URI ?? window.location.origin;

  const scope =
    process.env.NEXT_PUBLIC_API_SCOPE ??
    'api://api-11plusplatform-dev/access_as_user';

  await msal.loginRedirect({
    scopes: [scope],
    redirectUri,
  });
}

export async function logout(): Promise<void> {
  const msal = await ensureMsalReady();
  await msal.logoutRedirect({
    postLogoutRedirectUri:
      process.env.NEXT_PUBLIC_POST_LOGOUT_REDIRECT_URI ?? window.location.origin,
  });
}
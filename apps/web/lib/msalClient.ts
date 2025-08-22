'use client';

import {
  PublicClientApplication,
  type AccountInfo,
} from '@azure/msal-browser';

let instance: PublicClientApplication | null = null;
let readyPromise: Promise<void> | null = null;

/** Build the singleton (do not use it until ensureMsalReady() resolves). */
function createMsal(): PublicClientApplication {
  if (typeof window === 'undefined') {
    throw new Error('MSAL can only be used in the browser');
  }

  const clientId = process.env.NEXT_PUBLIC_CIAM_CLIENT_ID ?? '';
  const authorityBase = process.env.NEXT_PUBLIC_CIAM_AUTHORITY ?? '';
  const userFlow = process.env.NEXT_PUBLIC_CIAM_USER_FLOW ?? 'SignUpSignIn';
  const authority = `${authorityBase}/${userFlow}`;

  const redirectUri = process.env.NEXT_PUBLIC_REDIRECT_URI ?? window.location.origin;
  const knownAuthorities = [process.env.NEXT_PUBLIC_CIAM_DOMAIN ?? ''];

  return new PublicClientApplication({
    auth: { clientId, authority, redirectUri, knownAuthorities },
  });
}

/** Get (or create) the singleton — might not be initialized yet. */
export function getMsal(): PublicClientApplication {
  if (!instance) {
    instance = createMsal();
    // for console debugging
    (window as Window & { msalInstance?: PublicClientApplication }).msalInstance = instance;
  }
  return instance;
}

/** Ensure MSAL v3 is initialized and the active account is set. */
export async function ensureMsalReady(): Promise<PublicClientApplication> {
  const msal = getMsal();

  if (!readyPromise) {
    readyPromise = (async () => {
      // v3 requirement
      await msal.initialize();

      // Finish any pending redirect and set active account
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

/** Get the current account after init; sets one active if available. */
export async function getActiveAccount(): Promise<AccountInfo | null> {
  const msal = await ensureMsalReady();
  let acc = msal.getActiveAccount();
  if (acc) return acc;
  acc = msal.getAllAccounts()[0] ?? null;
  if (acc) msal.setActiveAccount(acc);
  return acc;
}

/** Acquire an API access token (after init). */
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

/** Login flow */
export async function login(): Promise<void> {
  const msal = await ensureMsalReady();
  const redirectUri = process.env.NEXT_PUBLIC_REDIRECT_URI ?? window.location.origin;

  // Scopes can be empty for login, but passing API scope helps warm the cache
  const scope =
    process.env.NEXT_PUBLIC_API_SCOPE ??
    'api://api-11plusplatform-dev/access_as_user';

  await msal.loginRedirect({
    scopes: [scope],
    redirectUri,
  });
}

/** Logout flow */
export async function logout(): Promise<void> {
  const msal = await ensureMsalReady();
  await msal.logoutRedirect({
    postLogoutRedirectUri:
      process.env.NEXT_PUBLIC_POST_LOGOUT_REDIRECT_URI ?? window.location.origin,
  });
}
'use client';

import { PublicClientApplication, type AccountInfo } from '@azure/msal-browser';

let instance: PublicClientApplication | null = null;

/** Create or return the singleton MSAL instance (browser only). */
export function getMsal(): PublicClientApplication {
  if (typeof window === 'undefined') {
    throw new Error('MSAL can only be used in the browser');
  }
  if (instance) return instance;

  const clientId = process.env.NEXT_PUBLIC_CIAM_CLIENT_ID ?? '';
  const authorityBase = process.env.NEXT_PUBLIC_CIAM_AUTHORITY ?? '';
  const userFlow = process.env.NEXT_PUBLIC_CIAM_USER_FLOW ?? 'SignUpSignIn';
  const authority = `${authorityBase}/${userFlow}`;

  const redirectUri = process.env.NEXT_PUBLIC_REDIRECT_URI ?? window.location.origin;
  const knownAuthorities = [process.env.NEXT_PUBLIC_CIAM_DOMAIN ?? ''];

  instance = new PublicClientApplication({
    auth: { clientId, authority, redirectUri, knownAuthorities }
  });

  // Expose for console debugging if you like:
  (window as Window & { msalInstance?: PublicClientApplication }).msalInstance = instance;

  // Handle redirect result once when the app spins up
  void instance.handleRedirectPromise().then((result) => {
    if (result?.account) {
      instance!.setActiveAccount(result.account);
    } else {
      const existing = instance!.getAllAccounts()[0];
      if (existing) instance!.setActiveAccount(existing);
    }
  }).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('MSAL redirect error', err);
  });

  return instance;
}

/** Get the active account (or first account), and set it active if needed. */
export function getActiveAccount(): AccountInfo | null {
  const msal = getMsal();
  const active = msal.getActiveAccount();
  if (active) return active;
  const first = msal.getAllAccounts()[0] ?? null;
  if (first) msal.setActiveAccount(first);
  return first;
}

/** Acquire an access token for the API scope. */
export async function getApiToken(): Promise<string> {
  const msal = getMsal();
  const account = getActiveAccount();
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

/** Convenience helpers for auth UI */
export async function login(): Promise<void> {
  const msal = getMsal();
  const redirectUri = process.env.NEXT_PUBLIC_REDIRECT_URI ?? window.location.origin;
  await msal.loginRedirect({
    scopes: [process.env.NEXT_PUBLIC_API_SCOPE ?? ''],
    redirectUri,
  });
}

export async function logout(): Promise<void> {
  const msal = getMsal();
  await msal.logoutRedirect({
    postLogoutRedirectUri:
      process.env.NEXT_PUBLIC_POST_LOGOUT_REDIRECT_URI ?? window.location.origin,
  });
}
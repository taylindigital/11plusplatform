'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  PublicClientApplication,
  AccountInfo,
  RedirectRequest,
  SilentRequest,
} from '@azure/msal-browser';

interface AuthContextValue {
  account: AccountInfo | null;
  login: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <Providers>');
  return ctx;
};

export default function Providers({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<AccountInfo | null>(null);

  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_CIAM_CLIENT_ID ?? '';
    const authority = `${process.env.NEXT_PUBLIC_CIAM_AUTHORITY}/${process.env.NEXT_PUBLIC_CIAM_USER_FLOW}`;
    const redirectUri = process.env.NEXT_PUBLIC_REDIRECT_URI ?? window.location.origin;

    const msal = new PublicClientApplication({
      auth: {
        clientId,
        authority,
        redirectUri,
        knownAuthorities: [process.env.NEXT_PUBLIC_CIAM_DOMAIN ?? ''],
      },
    });

    // Store globally so console debugging is easy
    (window as Window & { msalInstance?: PublicClientApplication }).msalInstance = msal;

    msal
      .handleRedirectPromise()
      .then((result) => {
        if (result?.account) {
          setAccount(result.account);
          msal.setActiveAccount(result.account);
        } else {
          const existing = msal.getAllAccounts()[0];
          if (existing) {
            setAccount(existing);
            msal.setActiveAccount(existing);
          }
        }
      })
      .catch((err: unknown) => {
        console.error('MSAL redirect error', err);
      });
  }, []);

  const login = async () => {
    const msal = (window as Window & { msalInstance?: PublicClientApplication }).msalInstance;
    if (!msal) return;
    const request: RedirectRequest = {
      scopes: [process.env.NEXT_PUBLIC_API_SCOPE ?? ''],
      redirectUri: process.env.NEXT_PUBLIC_REDIRECT_URI ?? window.location.origin,
    };
    await msal.loginRedirect(request);
  };

  const logout = () => {
    const msal = (window as Window & { msalInstance?: PublicClientApplication }).msalInstance;
    if (!msal) return;
    msal.logoutRedirect({
      postLogoutRedirectUri:
        process.env.NEXT_PUBLIC_POST_LOGOUT_REDIRECT_URI ?? window.location.origin,
    });
  };

  return <AuthContext.Provider value={{ account, login, logout }}>{children}</AuthContext.Provider>;
}
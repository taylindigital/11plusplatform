'use client';

import React, { useEffect, useMemo, useState, useContext, createContext } from 'react';
import { PublicClientApplication, type Configuration, type AccountInfo } from '@azure/msal-browser';

type AuthContextValue = {
  account: AccountInfo | null;
  login: () => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <Providers>');
  return ctx;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  const env = useMemo(
    () => ({
      NEXT_PUBLIC_CIAM_CLIENT_ID: process.env.NEXT_PUBLIC_CIAM_CLIENT_ID ?? '',
      NEXT_PUBLIC_CIAM_AUTHORITY: process.env.NEXT_PUBLIC_CIAM_AUTHORITY ?? '',
      NEXT_PUBLIC_REDIRECT_URI: process.env.NEXT_PUBLIC_REDIRECT_URI ?? '/',
      NEXT_PUBLIC_POST_LOGOUT_REDIRECT_URI: process.env.NEXT_PUBLIC_POST_LOGOUT_REDIRECT_URI ?? '/',
    }),
    []
  );

  const [account, setAccount] = useState<AccountInfo | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const msalConfig: Configuration = {
      auth: {
        clientId: env.NEXT_PUBLIC_CIAM_CLIENT_ID,
        authority: env.NEXT_PUBLIC_CIAM_AUTHORITY,
        redirectUri: env.NEXT_PUBLIC_REDIRECT_URI,
        postLogoutRedirectUri: env.NEXT_PUBLIC_POST_LOGOUT_REDIRECT_URI,
      },
      cache: { cacheLocation: 'localStorage', storeAuthStateInCookie: false },
    };

    const instance = new PublicClientApplication(msalConfig);
    (window as any).msalInstance = instance;

    instance.handleRedirectPromise().then(result => {
      if (result?.account) {
        instance.setActiveAccount(result.account);
        setAccount(result.account);
      } else {
        const current = instance.getAllAccounts()[0];
        if (current) {
          instance.setActiveAccount(current);
          setAccount(current);
        }
      }
    });
  }, [env]);

  const login = () => window.msalInstance?.loginRedirect({ scopes: [] });
  const logout = () => window.msalInstance?.logoutRedirect();

  return (
    <AuthContext.Provider value={{ account, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
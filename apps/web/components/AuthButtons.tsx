'use client';
import { useEffect } from 'react';
import { useMsal } from '@azure/msal-react';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE!;
const API_SCOPE = process.env.NEXT_PUBLIC_API_SCOPE!;

export default function AuthButtons() {
  const { instance, accounts } = useMsal();
  const loggedIn = accounts.length > 0;

  const login = async () => {
    await instance.loginRedirect({
      scopes: ['openid', 'profile', 'email'],
      redirectStartPage: '/',
    });
  };

  const logout = () => instance.logoutRedirect();

  // After login, call /api/users/init once to upsert our user
  useEffect(() => {
    (async () => {
      if (!loggedIn) return;
      const { accessToken } = await instance.acquireTokenSilent({
        account: accounts[0],
        scopes: [API_SCOPE],
      });
      await fetch(`${API_BASE}/api/users/init`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    })();
  }, [loggedIn, instance, accounts]);

  return (
    <div className="flex flex-col items-center gap-3">
      {loggedIn ? (
        <button className="px-4 py-2 rounded bg-black text-white" onClick={logout}>
          Logout
        </button>
      ) : (
        <button className="px-4 py-2 rounded bg-blue-600 text-white" onClick={login}>
          Login / Sign up
        </button>
      )}
    </div>
  );
}

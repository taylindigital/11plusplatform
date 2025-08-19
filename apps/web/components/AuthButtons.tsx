'use client';
import { useMsal } from '@azure/msal-react';

export default function AuthButtons() {
  const { instance, accounts } = useMsal();
  const loggedIn = accounts.length > 0;

  const login = async () => {
    await instance.loginRedirect({
      scopes: ['openid', 'profile', 'email', 'offline_access'],
      redirectStartPage: '/', // after successful auth, land here
    });
  };

  const logout = () => instance.logoutRedirect();

  return (
    <div className="flex flex-col items-center gap-3">
      {loggedIn ? (
        <>
          <div>Signed in as <strong>{accounts[0]?.username}</strong></div>
          <button className="px-4 py-2 rounded bg-black text-white" onClick={logout}>Logout</button>
        </>
      ) : (
        <button className="px-4 py-2 rounded bg-blue-600 text-white" onClick={login}>Login / Sign up</button>
      )}
    </div>
  );
}

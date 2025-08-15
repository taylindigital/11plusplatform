'use client';
import { useMsal } from '@azure/msal-react';

export default function AuthButtons() {
  const { instance, accounts } = useMsal();
  const loggedIn = accounts.length > 0;

  const login = () => instance.loginRedirect();
  const logout = () => instance.logoutRedirect();

  return (
    <div>
      {loggedIn ? (
        <button onClick={logout}>Logout</button>
      ) : (
        <button onClick={login}>Login / Sign up</button>
      )}
    </div>
  );
}

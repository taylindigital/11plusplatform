'use client';
import { useMsal } from '@azure/msal-react';

export default function AuthButtons() {
  const { instance, accounts } = useMsal();
  const loggedIn = accounts.length > 0;

  const login = async () => {
    try {
      await instance.loginRedirect(); // we can add scopes later
    } catch (e) {
      // eslint-disable-next-line no-alert
      alert('Login error: ' + (e as Error).message);
      // eslint-disable-next-line no-console
      console.error(e);
    }
  };
  const logout = () => instance.logoutRedirect();

  return (
    <div className="flex gap-3">
      {loggedIn ? (
        <button className="px-4 py-2 rounded bg-black text-white" onClick={logout}>Logout</button>
      ) : (
        <button className="px-4 py-2 rounded bg-blue-600 text-white" onClick={login}>Login / Sign up</button>
      )}
    </div>
  );
}

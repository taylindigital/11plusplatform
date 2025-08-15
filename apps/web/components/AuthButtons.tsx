'use client';
import { useMsal } from '@azure/msal-react';

export default function AuthButtons() {
  const { instance, accounts } = useMsal();
  const loggedIn = accounts.length > 0;

  const login = () => instance.loginRedirect();
  const logout = () => instance.logoutRedirect();
// apps/web/components/AuthButtons.tsx
<button className="px-4 py-2 rounded bg-black text-white" onClick={login}>
  Login / Sign up
</button>
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

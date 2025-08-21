'use client';

import { useAuth } from '@/app/providers';

export default function AuthButtons() {
  const { msal, account, login, logout } = useAuth();

  const label = account?.username
    ? `Signed in as ${account.username}`
    : 'Not signed in';

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="text-sm text-gray-700">{label}</div>

      {!account ? (
        <button
          onClick={() => void login()}
          className="px-4 py-2 rounded bg-blue-600 text-white"
          disabled={!msal}
        >
          Login / Sign up
        </button>
      ) : (
        <button
          onClick={() => void logout()}
          className="px-4 py-2 rounded bg-gray-700 text-white"
        >
          Logout
        </button>
      )}
    </div>
  );
}
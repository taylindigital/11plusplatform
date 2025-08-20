'use client';
import { useMsal } from '@azure/msal-react';
import { useEffect, useState } from 'react';

const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL?.toLowerCase();

export function useIsAdmin() {
  const { accounts } = useMsal();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const email = accounts[0]?.username?.toLowerCase() || accounts[0]?.idTokenClaims?.preferred_username?.toLowerCase();
    setIsAdmin(!!ADMIN_EMAIL && !!email && email === ADMIN_EMAIL);
  }, [accounts]);

  return isAdmin;
}
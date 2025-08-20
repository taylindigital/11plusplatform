'use client';
import Link from 'next/link';
import { useIsAdmin } from '@/lib/useIsAdmin';

export default function AdminLink() {
  const isAdmin = useIsAdmin();
  if (!isAdmin) return null;
  return (
    <div className="mt-6">
      <Link href="/admin" className="text-sm underline">
        Go to Admin
      </Link>
    </div>
  );
}
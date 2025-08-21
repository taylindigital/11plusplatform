'use client';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { useEffect, useState } from 'react';

export default function AdminPage() {
  const [ok, setOk] = useState(false);

  useEffect(() => {
    // keep empty; this ensures we only run in the browser
    setOk(true);
  }, []);

  if (!ok) return null;

  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold">Admin</h1>
      {/* TODO: re-add the real admin UI once step 3 is done */}
    </main>
  );
}
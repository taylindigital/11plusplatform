import AuthButtons from '@/components/AuthButtons';
import AuthDebug from '@/components/AuthDebug';
import GetApiToken from '@/components/GetApiToken';
import CallApi from '@/components/CallApi';
import StatusGate from '@/components/StatusGate';
import Link from 'next/link';
import { useIsAdmin } from '@/lib/useIsAdmin';

const isAdmin = useIsAdmin();

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4">
      <h1 className="text-3xl font-bold">🚀 11+ Platform</h1>
      <AuthButtons />
      <GetApiToken />
      <CallApi />
      <AuthDebug />
    </main>
  );
}

{isAdmin && (
  <div className="mt-6">
    <Link href="/admin" className="text-sm underline">
      Go to Admin
    </Link>
  </div>
)}

<StatusGate>
  <div className="mt-6 p-4 border rounded">
    <p className="font-medium">Approved-only area</p>
    <p className="text-sm text-gray-600">This is visible only when your status is approved.</p>
  </div>
</StatusGate>
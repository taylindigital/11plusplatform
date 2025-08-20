// apps/web/app/page.tsx
import AuthButtons from '@/components/AuthButtons';
import AuthDebug from '@/components/AuthDebug';
import GetApiToken from '@/components/GetApiToken';
import CallApi from '@/components/CallApi';
import StatusGate from '@/components/StatusGate';
import AdminLink from '@/components/AdminLink';

// This file is a Server Component by default — no hooks here.
export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-6">
      <h1 className="text-3xl font-bold">🚀 11+ Platform</h1>

      {/* Auth controls */}
      <AuthButtons />
      <GetApiToken />
      <CallApi />
      <AuthDebug />

      {/* Admin link (renders only for admin inside the client component) */}
      <AdminLink />

      {/* Approved-only area (gated client-side based on /api/users/me) */}
      <StatusGate>
        <div className="mt-6 p-4 border rounded">
          <p className="font-medium">Approved-only area</p>
          <p className="text-sm text-gray-600">
            This content is visible only when your account status is <strong>approved</strong>.
          </p>
        </div>
      </StatusGate>
    </main>
  );
}
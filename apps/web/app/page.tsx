import AuthButtons from '@/components/AuthButtons';
import AuthDebug from '@/components/AuthDebug';
import GetApiToken from '@/components/GetApiToken';
import CallApi from '@/components/CallApi';

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

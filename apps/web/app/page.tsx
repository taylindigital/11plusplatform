import AuthButtons from '@/components/AuthButtons';
import AuthDebug from '@/components/AuthDebug';

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4">
      <h1 className="text-3xl font-bold">🚀 11+ Platform</h1>
      <AuthButtons />
      <AuthDebug />
    </main>
  );
}

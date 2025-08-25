// apps/web/app/page.tsx
import AuthButtons from '@/components/AuthButtons';

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-3xl font-bold">🚀 11+ Platform</h1>
      <AuthButtons />
    </main>
  );
}

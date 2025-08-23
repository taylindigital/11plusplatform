// apps/web/app/layout.tsx
import type { Metadata } from 'next';
import './globals.css';
import Providers from './providers';

export const metadata: Metadata = {
  title: '11+ Platform',
  description: 'Admin & user portal',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Expose NEXT_PUBLIC_* vars to the client at runtime
  const env = {
    NEXT_PUBLIC_API_BASE: process.env.NEXT_PUBLIC_API_BASE ?? '',
    NEXT_PUBLIC_API_SCOPE: process.env.NEXT_PUBLIC_API_SCOPE ?? '',
    NEXT_PUBLIC_ADMIN_EMAIL: process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? '',
    NEXT_PUBLIC_CIAM_AUTHORITY: process.env.NEXT_PUBLIC_CIAM_AUTHORITY ?? '',
    NEXT_PUBLIC_CIAM_METADATA_URL: process.env.NEXT_PUBLIC_CIAM_METADATA_URL ?? '',
    NEXT_PUBLIC_REDIRECT_URI: process.env.NEXT_PUBLIC_REDIRECT_URI ?? '',
  };

  // Safely serialize to avoid </script> breakage etc.
  const envJson = JSON.stringify(env).replace(/</g, '\\u003c');

  return (
    <html lang="en">
      <body>
        {/* Make NEXT_PUBLIC_* available at runtime on the client */}
        <script
          id="__env"
          dangerouslySetInnerHTML={{ __html: `window.__env=${envJson};` }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
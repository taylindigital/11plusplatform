// apps/web/app/layout.tsx
import type { Metadata } from 'next';
import Providers from './providers';

export const metadata: Metadata = {
  title: '11+ Platform',
};

function envToScript(): string {
  const env = {
    NEXT_PUBLIC_CIAM_CLIENT_ID: process.env.NEXT_PUBLIC_CIAM_CLIENT_ID ?? '',
    NEXT_PUBLIC_CIAM_AUTHORITY: process.env.NEXT_PUBLIC_CIAM_AUTHORITY ?? '',
    NEXT_PUBLIC_CIAM_DOMAIN: process.env.NEXT_PUBLIC_CIAM_DOMAIN ?? '',
    NEXT_PUBLIC_CIAM_METADATA_URL: process.env.NEXT_PUBLIC_CIAM_METADATA_URL ?? '',
    NEXT_PUBLIC_CIAM_USER_FLOW: process.env.NEXT_PUBLIC_CIAM_USER_FLOW ?? '',
    NEXT_PUBLIC_REDIRECT_URI: process.env.NEXT_PUBLIC_REDIRECT_URI ?? '',
    NEXT_PUBLIC_API_SCOPE: process.env.NEXT_PUBLIC_API_SCOPE ?? '',
    NEXT_PUBLIC_API_BASE: process.env.NEXT_PUBLIC_API_BASE ?? '',
    NEXT_PUBLIC_ADMIN_EMAIL: process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? '',
  };

  const json = JSON.stringify(env).replace(/</g, '\\u003c');
  return `window.__env = ${json};`;
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const envScript = envToScript();
  return (
    <html lang="en">
      <body>
        {/* Expose NEXT_PUBLIC_* to the browser at runtime */}
        <script id="__env" dangerouslySetInnerHTML={{ __html: envScript }} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
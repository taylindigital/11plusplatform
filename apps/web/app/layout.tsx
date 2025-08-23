// apps/web/app/layout.tsx
import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '11+ Platform',
  description: 'Login',
};

// Helper to JSON.stringify with empty-string fallback
function j(v: unknown) {
  return JSON.stringify(typeof v === 'undefined' ? '' : v);
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // NOTE: These values are read at build time from process.env.*.
  // In SWA, you’ve defined them in the portal; Next bakes them in here.
  const envScript = `
    window.__env = {
      NEXT_PUBLIC_CIAM_CLIENT_ID: ${j(process.env.NEXT_PUBLIC_CIAM_CLIENT_ID)},
      NEXT_PUBLIC_CIAM_TENANT_ID: ${j(process.env.NEXT_PUBLIC_CIAM_TENANT_ID)},
      NEXT_PUBLIC_CIAM_USER_FLOW: ${j(process.env.NEXT_PUBLIC_CIAM_USER_FLOW)},
      NEXT_PUBLIC_CIAM_DOMAIN: ${j(process.env.NEXT_PUBLIC_CIAM_DOMAIN)},
      NEXT_PUBLIC_CIAM_AUTHORITY: ${j(process.env.NEXT_PUBLIC_CIAM_AUTHORITY)},
      NEXT_PUBLIC_CIAM_METADATA_URL: ${j(process.env.NEXT_PUBLIC_CIAM_METADATA_URL)},
      NEXT_PUBLIC_API_SCOPE: ${j(process.env.NEXT_PUBLIC_API_SCOPE)},
      NEXT_PUBLIC_API_BASE: ${j(process.env.NEXT_PUBLIC_API_BASE)},
      NEXT_PUBLIC_ADMIN_EMAIL: ${j(process.env.NEXT_PUBLIC_ADMIN_EMAIL)},
      NEXT_PUBLIC_REDIRECT_URI: ${j(process.env.NEXT_PUBLIC_REDIRECT_URI)},
      NEXT_PUBLIC_POST_LOGOUT_REDIRECT_URI: ${j(process.env.NEXT_PUBLIC_POST_LOGOUT_REDIRECT_URI)}
    };
  `;

  return (
    <html lang="en">
      <body>
        {/* Make NEXT_PUBLIC_* available at runtime on the client */}
        <script
          id="__env"
          dangerouslySetInnerHTML={{ __html: envScript }}
        />
        {children}
      </body>
    </html>
  );
}
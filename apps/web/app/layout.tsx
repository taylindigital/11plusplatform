import type { ReactNode } from 'react';
import Providers from './providers';
import './globals.css';

export const metadata = {
  title: '11+ Platform',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
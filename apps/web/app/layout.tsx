import './globals.css';
import React from 'react';
import Providers from './providers';

export const metadata = {
  title: '11+ Platform',
  description: 'Dev',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
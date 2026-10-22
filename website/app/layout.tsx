import './global.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  metadataBase: new URL('https://ilokesto.ayden94.com'),
  title: {
    default: 'ilokesto',
    template: '%s | ilokesto',
  },
  description: 'Official documentation for the ilokesto package family.',
  icons: {
    icon: '/favicon.ico',
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="inter-font" suppressHydrationWarning>
      <head>
        <link
          rel="preload"
          href="/fonts/inter-latin.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body className="flex flex-col min-h-screen">{children}</body>
    </html>
  );
}

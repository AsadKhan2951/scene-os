import type { Metadata } from 'next';
import './globals.css';
import { THEME_BOOT } from '@/lib/themeBoot';

export const metadata: Metadata = {
  title: 'Scene OS',
  description: 'The operating system for scripted-content production',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600&family=Courier+Prime:wght@400;700&family=Noto+Nastaliq+Urdu:wght@400;600&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

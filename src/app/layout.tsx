import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'H2H | Esports Edge & Integrity Terminal',
  description:
    'Live Polymarket esports anomaly radar, suspicious bet detection, and 4-pillar AI betting analyzer for CS2, Valorant, LoL, and Dota 2.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#060911] text-slate-100`}>
        {children}
      </body>
    </html>
  );
}

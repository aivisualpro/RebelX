import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppStateProvider } from './state/AppStateProvider';
import ConditionalHeader from '@/components/ConditionalHeader';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "RebelX - KPIs",
  description: "The modern, intelligent platform for teams",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning={true} className="dark h-full">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AppStateProvider>
          <ConditionalHeader />
          <main>
            {children}
          </main>
        </AppStateProvider>
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";

export const metadata: Metadata = {
  title: "JM 관리 시스템",
  description: "JM건축인테리어 통합 업무 관리",
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'JM관리',
  },
  icons: {
    apple: '/icons/apple-touch-icon.png',
    icon: '/icons/icon-192.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#16a34a',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full">
      <body className="h-full bg-gray-50">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}


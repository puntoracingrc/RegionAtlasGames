import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { UserThemeSync } from "@/components/user-theme-sync";
import {
  SITE_DEFAULT_URL,
  SITE_DESCRIPTION,
  SITE_LOGO,
  SITE_TITLE,
} from "@/lib/site-brand";
import { getSiteUrl } from "@/lib/site-url";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl() || SITE_DEFAULT_URL),
  title: {
    default: SITE_TITLE,
    template: `%s | ${SITE_LOGO}`,
  },
  description: SITE_DESCRIPTION,
  openGraph: {
    siteName: SITE_LOGO,
    locale: "es_ES",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-background text-foreground">
        <ThemeProvider>
          <UserThemeSync />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}

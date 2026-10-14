import type { Metadata } from "next";
import "./globals.css";
import AuthHashHandler from "@/components/AuthHashHandler";
import Providers from "@/components/Providers";
import GoogleAnalytics from "@/components/analytics/GoogleAnalytics";
import CookieConsent from "@/components/analytics/CookieConsent";
import { siteUrl, isProductionSite } from "@/lib/siteUrl";

export const metadata: Metadata = {
  // Load-bearing, not boilerplate: without it Next silently DROPS every
  // relative Open Graph image and canonical URL, so the blog's social previews
  // and canonical tags never reach the rendered head.
  metadataBase: new URL(siteUrl()),
  title: "iClosed – Customer Portal",
  description:
    "iClosed customer portal – manage your real-estate closing from intake to completion.",
  // Square favicons generated from logo.png (scripts/gen-favicon.cjs) so the
  // wide wordmark sits centered on a white square instead of being letterboxed.
  // Google Search Console HTML-tag verification (production env only).
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || undefined,
  },
  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // GA only on the real production site, never dev/preview.
  const gaId = isProductionSite()
    ? process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() || undefined
    : undefined;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Google Font */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>

      <body
        className="min-h-screen flex flex-col bg-[var(--color-bg)] text-[var(--color-text-body)]"
        suppressHydrationWarning
      >
        <Providers>
          <AuthHashHandler />
          {children}
        </Providers>
        <GoogleAnalytics gaId={gaId} />
        <CookieConsent enabled={!!gaId} />
      </body>
    </html>
  );
}
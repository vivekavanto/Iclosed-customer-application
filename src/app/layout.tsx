import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

export const metadata: Metadata = {
  title: "iClosed – Customer Portal",
  description:
    "iClosed customer portal – manage your real-estate closing from intake to completion.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
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

      <body className="min-h-screen flex flex-col bg-[var(--color-bg)] text-[var(--color-text-body)]">

        {/* Fixed Header */}
        <Header />

        {/* Main Content */}
        <main className="flex-grow pt-[100px]">
          {children}
        </main>

        {/* Footer */}
        <Footer />

      </body>
    </html>
  );
}
"use client";

import { Suspense, useEffect, useState } from "react";
import Script from "next/script";
import { usePathname } from "next/navigation";
import {
  CONSENT_EVENT,
  readConsent,
  type ConsentChoice,
} from "@/components/analytics/consent";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

// Private, authenticated or token-bearing routes: never reported to GA.
const EXCLUDED_PREFIXES = [
  "/admin",
  "/dashboard",
  "/details",
  "/documents",
  "/profile",
  "/retainer",
  "/quote",
  "/signing",
  "/blog/", // dashboard-group blog; the public one is /blogs
  "/set-password",
  "/reset-link-sent",
  "/forgot-password",
  "/login",
  "/lender",
  "/intake",
  "/api",
];

function isExcluded(path: string): boolean {
  return EXCLUDED_PREFIXES.some(
    (p) => path === p || path.startsWith(p.endsWith("/") ? p : `${p}/`),
  );
}

function PageViews({ gaId }: { gaId: string }) {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || isExcluded(pathname) || !window.gtag) return;
    // pathname only — query strings can carry tokens.
    window.gtag("config", gaId, {
      page_path: pathname,
      page_location: `${window.location.origin}${pathname}`,
    });
  }, [pathname, gaId]);

  return null;
}

/**
 * GA4 with Consent Mode: the script is loaded with analytics_storage denied and
 * only upgraded to granted after the visitor accepts the cookie banner.
 * `gaId` is passed in from the server layout, which only supplies it on the real
 * production site.
 */
export default function GoogleAnalytics({ gaId }: { gaId?: string }) {
  const [consent, setConsent] = useState<ConsentChoice | null>(null);

  useEffect(() => {
    setConsent(readConsent());
    const onChange = () => setConsent(readConsent());
    window.addEventListener(CONSENT_EVENT, onChange);
    return () => window.removeEventListener(CONSENT_EVENT, onChange);
  }, []);

  useEffect(() => {
    if (consent === "granted" && window.gtag) {
      window.gtag("consent", "update", { analytics_storage: "granted" });
    }
  }, [consent]);

  if (!gaId || consent !== "granted") return null;

  return (
    <>
      <Script id="ga-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
window.gtag = gtag;
gtag('consent','default',{analytics_storage:'denied'});
gtag('js', new Date());
gtag('consent','update',{analytics_storage:'granted'});
gtag('config','${gaId}',{send_page_view:false});`}
      </Script>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
        strategy="afterInteractive"
      />
      <Suspense fallback={null}>
        <PageViews gaId={gaId} />
      </Suspense>
    </>
  );
}

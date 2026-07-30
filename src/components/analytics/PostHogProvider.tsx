"use client";

import { useEffect } from "react";
import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;

export const isAnalyticsEnabled = Boolean(POSTHOG_KEY);

function initPostHog() {
  if (!POSTHOG_KEY || posthog.__loaded) return;

  posthog.init(POSTHOG_KEY, {
    api_host: "/ingest",
    ui_host: "https://eu.posthog.com",
    defaults: "2026-06-25",

    capture_pageview: "history_change",
    autocapture: true,
    capture_exceptions: true,

    mask_all_text: true,
    mask_personal_data_properties: true,
    custom_personal_data_properties: [
      "token",
      "lead_id",
      "deal_id",
      "email",
      "access_token",
      "refresh_token",
    ],

    person_profiles: "identified_only",

    // Blocks img/video wholesale rather than per-element: the portal renders ID
    // photos and signed document URLs, so a missed tag would leak one.
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: ".ph-mask",
      blockSelector: ".ph-no-capture, img, video, canvas, iframe",
    },
  });
}

export default function PostHogProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    initPostHog();
  }, []);

  if (!POSTHOG_KEY) return <>{children}</>;

  return <PHProvider client={posthog}>{children}</PHProvider>;
}

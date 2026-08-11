"use client";

import { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/Toast";
import PostHogProvider from "@/components/analytics/PostHogProvider";

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <PostHogProvider>
      <ToastProvider>{children}</ToastProvider>
    </PostHogProvider>
  );
}

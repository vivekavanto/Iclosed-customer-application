import type { Metadata } from "next";
import PublicSigningPage from "@/components/PublicSigningPage";

// /signing — "choose your lawyer, then book" page for a signed-in client
// using the dashboard nav link. Lives in the (dashboard) route group so it
// gets the same header/nav as the rest of the portal (see
// src/app/(dashboard)/layout.tsx). A client without an account instead uses
// the direct link at src/app/(public)/signing/[lawyerInitials]/page.tsx,
// which renders the same PublicSigningPage component but with its own
// logo header since there's no dashboard nav to show there.

export const metadata: Metadata = {
  title: "Book a Signing Appointment | iClosed",
  description: "Schedule your document-signing appointment.",
};

export default function SigningLandingPage() {
  return <PublicSigningPage showOwnHeader={false} />;
}

import type { Metadata } from "next";
import PublicSigningLawyerList from "@/components/PublicSigningLawyerList";

// /signing — "choose your lawyer" landing page for a client with no specific
// /signing/[initials] link. See src/app/(public)/signing/[lawyerInitials]/
// for the actual booking page once a lawyer is picked.

export const metadata: Metadata = {
  title: "Book a Signing Appointment | iClosed",
  description: "Schedule your document-signing appointment.",
  robots: { index: false, follow: false },
};

export default function SigningLandingPage() {
  return <PublicSigningLawyerList />;
}

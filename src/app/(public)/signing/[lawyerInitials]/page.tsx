import type { Metadata } from "next";
import PublicSigningBookingPage from "@/components/PublicSigningBookingPage";

// The client-facing signing-appointment booking page: /signing/AT
//
// PUBLIC — no session, same (public) group as /login and
// /closing-cost-calculator. The real booking logic (lawyer hours, Google
// Calendar) lives in the admin app; this page's /api/signing/* calls are
// proxied there server-to-server (see src/app/api/signing/**).

export const metadata: Metadata = {
  title: "Book a Signing Appointment | iClosed",
  description: "Schedule your document-signing appointment.",
  robots: { index: false, follow: false },
};

export default async function SigningPage({
  params,
}: {
  params: Promise<{ lawyerInitials: string }>;
}) {
  const { lawyerInitials } = await params;
  return <PublicSigningBookingPage lawyerInitials={lawyerInitials} />;
}

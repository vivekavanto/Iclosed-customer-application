import type { Metadata } from "next";
import PublicSigningPage from "@/components/PublicSigningPage";

// /book-appointment — public (no session) booking page reached from the
// marketing header on the home and blog pages. Renders the same booking UI as
// /signing/[lawyerInitials], with the shared marketing header.

export const metadata: Metadata = {
  title: "Book a Signing Appointment | iClosed",
  description: "Schedule your document-signing appointment.",
};

export default function BookAppointmentPage() {
  return <PublicSigningPage />;
}

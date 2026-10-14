import type { Metadata } from "next";
import PublicSigningPage from "@/components/PublicSigningPage";

// /book-appointment/AT — a lawyer's own booking link, shared by the lawyer (or
// copied from the admin app's Settings > Signing > Lawyers). PUBLIC, no
// session. Shows only that lawyer's calendar: there is no lawyer picker, so a
// visitor cannot browse to anyone else. An unknown or inactive code renders the
// page's own "link is not valid" card.
//
// The signed-in client flow (/signing?deal=…) and its default calendar are
// separate and untouched.

export const metadata: Metadata = {
  title: "Book a Signing Appointment | iClosed",
  description: "Schedule your document-signing appointment.",
  robots: { index: false, follow: false },
};

export default async function LawyerBookingPage({
  params,
}: {
  params: Promise<{ lawyerInitials: string }>;
}) {
  const { lawyerInitials } = await params;
  return <PublicSigningPage lawyerInitials={lawyerInitials} linkOnly />;
}

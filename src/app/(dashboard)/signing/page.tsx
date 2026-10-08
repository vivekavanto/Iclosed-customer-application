import type { Metadata } from "next";
import PublicSigningPage from "@/components/PublicSigningPage";
import { getSigningBookingState } from "@/lib/signingCalendar";

// /signing — a signed-in client's booking page, opened from the "Book your
// signing appointment" task (?deal=&side=). The calendar is fixed by the admin. Lives in the (dashboard) route group so it
// gets the same header/nav as the rest of the portal (see
// src/app/(dashboard)/layout.tsx). A client without an account instead uses
// the direct link at src/app/(public)/signing/[lawyerInitials]/page.tsx,
// which renders the same PublicSigningPage component but with its own
// logo header since there's no dashboard nav to show there.

export const metadata: Metadata = {
  title: "Book a Signing Appointment | iClosed",
  description: "Schedule your document-signing appointment.",
};

export default async function SigningLandingPage({
  searchParams,
}: {
  searchParams: Promise<{ deal?: string; side?: string }>;
}) {
  const { deal, side } = await searchParams;
  // Resolve the calendar and any existing booking on the server so a property
  // that is already booked renders its card immediately, with no form flash.
  const state = await getSigningBookingState(deal || null, side);
  return (
    <PublicSigningPage
      showOwnHeader={false}
      initialState={state.ok ? { initials: state.data.initials, booked: state.data.booked } : undefined}
      dealId={deal || undefined}
      side={side === "purchase" || side === "sale" ? side : undefined}
    />
  );
}

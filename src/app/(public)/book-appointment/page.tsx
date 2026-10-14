import type { Metadata } from "next";
import { TriangleAlert } from "lucide-react";
import SiteHeader from "@/components/layout/SiteHeader";

// /book-appointment — deliberately NOT a booking page any more. Signing
// appointments are by invitation only: each lawyer has their own link
// (/book-appointment/AT) that they share with the client. This bare URL used to
// let anyone pick a lawyer and book; it now only explains how to get a link.

export const metadata: Metadata = {
  title: "Book a Signing Appointment | iClosed",
  robots: { index: false, follow: false },
};

export default function BookAppointmentPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <SiteHeader />
      <div className="mx-auto max-w-6xl px-4 pb-8 pt-24">
        <div className="mx-auto w-full max-w-lg overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="h-1 w-full bg-[#C10007]" />
          <div className="p-5 text-center sm:p-6 lg:p-8">
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-gray-50">
              <TriangleAlert className="h-5 w-5 text-gray-400" />
            </div>
            <h1 className="text-base font-bold text-[#1a1a1a]">Use your lawyer&apos;s booking link</h1>
            <p className="mt-1.5 text-sm text-gray-400">
              Signing appointments are booked through a personal link from your lawyer. Please use
              the link they sent you, or contact the office to receive one.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

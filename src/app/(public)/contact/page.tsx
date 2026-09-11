import type { Metadata } from "next";
import Link from "next/link";
import ContactForm from "@/components/contact/ContactForm";

// /contact — the public "Contact us" page.
//
// Sits in the (public) group alongside /login and /closing-cost-calculator:
// middleware guards PAGES only through its explicit PROTECTED_PAGES list and
// matcher, neither of which mentions /contact, so a visitor with no cookie
// reaches it without a redirect. The form posts to /api/contact, which mails
// the firm's support inbox.

export const metadata: Metadata = {
  title: "Contact Us | iClosed",
  description:
    "Get in touch with the iClosed team about your Ontario real estate closing — send us a message and we'll get back to you within one business day.",
  robots: { index: true, follow: true },
  openGraph: {
    title: "Contact iClosed",
    description:
      "Questions about your closing? Send the iClosed team a message.",
    type: "website",
  },
};

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header — mirrors the landing page's, so the page never feels orphaned. */}
      <header className="fixed top-0 inset-x-0 z-50 h-16 bg-white/95 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto w-full h-full px-5 sm:px-8 lg:px-10 flex items-center justify-between">
          <Link href="/" className="flex items-center select-none">
            <span
              className="text-[#C10007] font-bold italic text-xl leading-none"
              style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
            >
              i
            </span>
            <span className="font-bold text-xl text-gray-900 tracking-tight leading-none">
              Closed
            </span>
          </Link>

          <Link
            href="/intake"
            className="px-3 sm:px-5 py-2 text-sm font-semibold !text-white bg-[#C10007] rounded-sm hover:bg-[#a00006] transition-colors shadow-sm"
          >
            <span className="hidden sm:inline">Start your closing</span>
            <span className="sm:hidden">Get started</span>
          </Link>
        </div>
      </header>

      <main className="pt-16">
        <section className="relative overflow-hidden bg-gradient-to-b from-[#fef7f0] via-[#fdf2ea] to-white">
          <div className="pointer-events-none absolute top-0 right-0 h-[400px] w-[400px] rounded-full bg-[#C10007]/[0.07] blur-[120px]" />
          <div className="relative mx-auto max-w-7xl px-5 sm:px-8 lg:px-10 pt-14 pb-10 sm:pt-20 sm:pb-14 text-center">
            <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl">
              Contact <span className="text-[#C10007]">us</span>
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-gray-500 sm:text-lg">
              Have a question about your closing, our flat fee, or what happens
              next? Send us a message and we&apos;ll get right back to you.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-5 sm:px-8 lg:px-10 pb-20">
          <ContactForm />
        </section>
      </main>
    </div>
  );
}

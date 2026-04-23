import Link from "next/link";
import { Check, X } from "lucide-react";
import HomeHeaderAuth from "@/components/layout/HomeHeaderAuth";

const brands = [
  "buy.ca",
  "exp REALTY",
  "COLDWELL BANKER",
  "RE/MAX",
  "ROYAL LEPAGE",
  "CENTURY 21",
];

const steps = [
  {
    num: "01",
    title: "Share your details",
    desc: "Send us your deal information and we'll take it from there.",
  },
  {
    num: "02",
    title: "Stay in the loop",
    desc: "Track your progress in real time with your personal dashboard.",
  },
  {
    num: "03",
    title: "Connect with your lawyer",
    desc: "Review and sign your documents remotely, all online.",
  },
  {
    num: "04",
    title: "Close with confidence",
    desc: "Get notified the moment your closing is complete.",
  },
];

const plans = [
  {
    tag: "Purchase",
    price: "$1229",
    extra: "+ Disbursements",
    blurb: "Close on a property you are buying",
    cta: "Start your closing",
    dark: false,
  },
  {
    tag: "Sale",
    price: "$1129",
    extra: "+ Disbursements",
    blurb: "Close on a property you are selling",
    cta: "Start your closing",
    dark: true,
  },
  {
    tag: "Mortgage Refinance or Transfer",
    price: "$2099",
    extra: "+ Disbursements",
    blurb: "Refinance a mortgage on a property",
    cta: "Start your refinance",
    dark: false,
  },
];

const testimonials = [
  {
    name: "Priya S",
    text: "iClosed made my property sale feel completely manageable. Everything was explained clearly, and support was always there when I needed it.",
    stars: 5,
    bg: "#e91e8c",
  },
  {
    name: "Daniel M",
    text: "The whole process was smoother than I imagined. I didn't even need to leave my house.",
    stars: 5,
    bg: "#f97316",
  },
  {
    name: "Jonathan L",
    text: "I've worked with traditional firms before — this was a breath of fresh air. I never had to ask for updates. Everything was right in the dashboard.",
    stars: 5,
    bg: "#10b981",
  },
  {
    name: "Leah M",
    text: "Smooth, simple, and completely online",
    stars: 5,
    bg: "#3b82f6",
  },
  {
    name: "Grace T",
    text: "As a first-time homebuyer, I was nervous about the legal stuff. iClosed took that weight off my shoulders. They explained every step and responded faster than I expected. I felt supported the entire time.",
    stars: 5,
    bg: "#14b8a6",
  },
  {
    name: "Vanessa C",
    text: "I'm not tech-savvy, but their portal was easy to use. Uploading documents, chatting with the legal team, even signing — it all just worked.",
    stars: 5,
    bg: "#8b5cf6",
  },
  {
    name: "Sonia M",
    text: "I closed from out of province without a single visit to an office. Every milestone was tracked in the portal, and I never felt lost in the process. If you want a modern experience, this is it.",
    stars: 5,
    bg: "#6366f1",
  },
  {
    name: "Josh A",
    text: "Fast support, even on weekends.",
    stars: 4,
    bg: "#f59e0b",
  },
  {
    name: "Jessica N",
    text: "They handled both my sale and purchase. Seamless coordination across the board.",
    stars: 5,
    bg: "#22c55e",
  },
];

const features = [
  {
    title: "Your Deal, Your Dashboard",
    desc: "Send, receive, and organize every document digitally—no printing, no couriers, no stress.",
  },
  {
    title: "Know What's Happening, Always",
    desc: "Follow your transaction step-by-step with instant updates and alerts, so you're never left wondering.",
  },
  {
    title: "Legal Help That Works Around Your Life",
    desc: "Whether it's a quick chat, an email clarification, or a face-to-face video consult—we're here when you need us, even after hours.",
  },
  {
    title: "Straight Talk About Costs",
    desc: 'From day one, you\'ll know your full legal fee. No percentage-based surprises, no extra costs for "bigger" properties.',
  },
  {
    title: "Unlimited Access, Zero Extra Fees",
    desc: "Talk to us as often as you like. Ask, clarify, double-check—without worrying about added charges.",
  },
  {
    title: "Post-Closing Litigation Protection",
    desc: "Worried about potential breaches after closing? We've got you covered. Our peace-of-mind insurance includes the cost of a litigation lawyer's consultation and document review if a breach occurs. If your case proceeds, we work on a contingency fee—legal fees are only collected upon resolution or judgment.",
  },
  {
    title: "Ongoing Support for Post-Closing Issues",
    desc: "We're here to help even after your keys are in hand. Reach out for guidance on title questions, post-closing adjustments with the other party, or filing a title insurance claim.",
  },
  {
    title: "Empower Yourself with Knowledge",
    desc: "Explore our library of real estate guides, legal insights, and homeowner resources—all designed to make you feel confident and informed at every step.",
  },
  {
    title: "We provide a simple Post-Closing Checklist to guide your next steps",
    desc: "Stay organized with a simple list of everything to take care of after your closing is complete.",
  },
];

// ─── Header ───────────────────────────────────────────────────────────────────
function SiteHeader() {
  return (
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

        <div className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/intake"
            className="px-3 sm:px-5 py-2 text-sm font-semibold !text-white bg-[#C10007] rounded-sm hover:bg-[#a00006] transition-colors shadow-sm"
          >
            <span className="hidden sm:inline">Start your closing</span>
            <span className="sm:hidden">Get started</span>
          </Link>
          <HomeHeaderAuth />
        </div>
      </div>
    </header>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-[#fef7f0] via-[#fdf2ea] to-white py-16">
      {/* Warm ambient glows */}
      <div className="pointer-events-none absolute top-0 right-0 h-[500px] w-[500px] rounded-full bg-[#C10007]/[0.08] blur-[120px]" />
      <div className="pointer-events-none absolute top-40 -left-24 h-[400px] w-[400px] rounded-full bg-orange-200/40 blur-[100px]" />
      <div className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 h-[250px] w-[500px] rounded-full bg-[#fde8d8]/50 blur-[80px]" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-8 lg:px-10 pb-0 pt-12 sm:pt-16">
        {/* Social proof badge */}
        <div className="flex justify-center">
          <span className="inline-flex items-center gap-1.5 sm:gap-3 rounded-full border border-[#C10007]/20 bg-white/70 backdrop-blur-sm px-3 sm:px-5 py-1.5 sm:py-2 text-[11px] sm:text-sm shadow-sm">
            <span className="flex gap-1">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className="block h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-[#C10007]"
                  style={{ opacity: 1 - i * 0.2 }}
                />
              ))}
            </span>
            <span className="font-bold text-[#C10007]">10K+</span>
            <span className="hidden sm:inline text-gray-500">
              Helping thousands close smoothly across Ontario
            </span>
            <span className="sm:hidden text-gray-500">Ontario closings</span>
          </span>
        </div>

        {/* Headline */}
        <h1
          className="mx-auto mt-6 sm:mt-7 max-w-4xl text-center font-extrabold leading-[1.05] tracking-tight text-gray-900"
          style={{ fontSize: "clamp(32px, 7vw, 80px)" }}
        >
          Real Estate Closings
          <br />
          <span className="text-[#C10007]">Made Simple.</span>
        </h1>

        <p className="mx-auto mt-4 sm:mt-5 max-w-sm sm:max-w-lg text-center text-sm sm:text-lg leading-relaxed text-gray-500">
          Close on properties at your fingertips with iClosed&apos;s client—
          and team–synced communication.
        </p>

        {/* CTAs */}
        <div className="mt-7 sm:mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row px-2 sm:px-0">
          <Link
            href="/intake"
            className="w-full sm:w-auto rounded-sm bg-[#C10007] px-8 sm:px-9 py-3.5 text-center text-base font-semibold !text-white shadow-lg shadow-[#C10007]/25 transition-colors hover:bg-[#a00006]"
          >
            Start your closing
          </Link>
          <Link
            href="/login"
            className="w-full sm:w-auto rounded-lg border border-gray-300 bg-white/80 px-8 sm:px-9 py-3.5 text-center text-base font-semibold text-gray-700 transition-colors hover:bg-white"
          >
            Login
          </Link>
        </div>

        {/* Trust signal */}
        <p className="mt-4 sm:mt-5 text-center text-[11px] sm:text-sm text-gray-400">
          Top 10 Law firm for Ontario for the past decade
          <span className="mx-2 text-gray-300">•</span>
          PR Article for NW Wilson
        </p>

        {/* Hero dashboard cards */}
        {/* <div className="mx-auto mt-12 sm:mt-20 max-w-4xl">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4"> */}

        {/* Left — progress tracker (spans 2 cols) */}
        {/* <div className="sm:col-span-2 rounded-2xl border border-gray-100 bg-white p-5 sm:p-6 shadow-[0_4px_32px_0_rgba(0,0,0,0.07)]">
              <p className="mb-4 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                Milestones
              </p>
              <div className="space-y-0">
                {[
                  { label: "Intake complete", done: true },
                  { label: "Title search", done: true },
                  { label: "Signing appointment", done: false },
                  { label: "Closing day", done: false },
                ].map((s, idx, arr) => (
                  <div key={s.label}>
                    <div className="flex items-center gap-3 py-2.5">
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                          s.done
                            ? "bg-[#C10007] text-white"
                            : "border-2 border-gray-200 text-gray-300"
                        }`}
                      >
                        {s.done ? "✓" : idx + 1}
                      </span>
                      <span
                        className={`flex-1 text-xs sm:text-sm font-medium ${
                          s.done ? "text-gray-800" : "text-gray-400"
                        }`}
                      >
                        {s.label}
                      </span>
                      {s.done && (
                        <span className="text-[10px] font-semibold text-[#C10007]/70 bg-[#C10007]/8 px-2 py-0.5 rounded-full">
                          Complete
                        </span>
                      )}
                    </div>
                    {idx < arr.length - 1 && (
                      <div className="ml-3 h-4 w-px bg-gray-100" />
                    )}
                  </div>
                ))}
              </div>
            </div> */}

        {/* Right — stat cards */}
        {/* <div className="flex sm:flex-col gap-3">
              {[
                { label: "Documents", val: "4", hi: false },
                { label: "In Review", val: "2", hi: true },
                { label: "Signed", val: "7", hi: false },
              ].map(({ label, val, hi }) => (
                <div
                  key={label}
                  className={`flex-1 rounded-2xl p-4 sm:p-5 shadow-[0_4px_24px_0_rgba(0,0,0,0.06)] ${
                    hi
                      ? "border border-[#C10007]/20 bg-white"
                      : "border border-gray-100 bg-white"
                  }`}
                >
                  <p
                    className={`text-[10px] font-bold uppercase tracking-wider ${
                      hi ? "text-[#C10007]" : "text-gray-400"
                    }`}
                  >
                    {label}
                  </p>
                  <p className="mt-1.5 text-3xl sm:text-4xl font-extrabold text-gray-900">
                    {val}
                  </p>
                </div>
              ))}
            </div> */}

        {/* </div>
        </div> */}
      </div>
    </section>
  );
}


function TrustedBy() {
  return (
    <section className="bg-white border-y border-gray-100 py-10 sm:py-14">
      <div className="mx-auto max-w-7xl px-4 sm:px-8 lg:px-10">
        <p className="mb-7 sm:mb-8 text-center font-semibold  text-gray-400">
          Recommended by real estate professionals at
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
          {brands.map((b) => (
            <span
              key={b}
              className="rounded-full border border-gray-200 bg-gray-50 px-4 sm:px-5 py-2 sm:py-2.5 text-xs sm:text-sm font-bold tracking-wider text-gray-500 transition-all duration-200 hover:border-[#C10007]/30 hover:bg-white hover:text-[#C10007] hover:shadow-sm cursor-default"
            >
              {b}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── How It Works ─────────────────────────────────────────────────────────────
function HowItWorks() {
  return (
    <section className="bg-white py-16  ">
      <div className="mx-auto max-w-6xl px-4 sm:px-8 lg:px-10">

        {/* Centered section header */}
        <div className="mx-auto max-w-2xl text-center mb-12 sm:mb-16">
          <span className="inline-flex items-center gap-2.5 text-xs font-bold uppercase tracking-[0.2em] text-[#C10007]">
            <span className="block h-px w-8 bg-[#C10007]" />
            How it works
            <span className="block h-px w-8 bg-[#C10007]" />
          </span>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl lg:text-5xl">
            Our Simple Process
          </h2>
          <p className="mt-4 text-base sm:text-lg leading-relaxed text-gray-500">
            We guide you from the initial contact, all the way to closing, and
            after!
          </p>
        </div>

        {/* Step cards — 2-col grid, single col on mobile */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
          {steps.map((s, i) => (
            <div
              key={s.num}
              className="group flex flex-col gap-5 rounded-2xl border border-gray-100 bg-gray-50 p-6 sm:p-8 transition-all duration-300 hover:border-[#C10007]/15 hover:bg-white hover:shadow-xl hover:shadow-gray-200/60 hover:-translate-y-0.5"
            >
              {/* Top row: number badge + step label */}
              <div className="flex items-center justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#C10007] text-white font-extrabold text-base shadow-md shadow-[#C10007]/25 transition-transform duration-300 group-hover:scale-105 shrink-0">
                  {i + 1}
                </div>
                <span className="text-2xl font-black text-gray-100 select-none leading-none">
                  {s.num}
                </span>
              </div>

              {/* Content */}
              <div>
                <h3 className="text-lg sm:text-xl font-bold text-gray-900 leading-snug">
                  {s.title}
                </h3>
                <p className="mt-2.5 text-sm sm:text-[15px] leading-relaxed text-gray-500">
                  {s.desc}
                </p>
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}

// ─── Pricing ──────────────────────────────────────────────────────────────────
function Pricing() {
  return (
    <section className="bg-white py-16 ">
      <div className="mx-auto max-w-5xl px-4 sm:px-8 lg:px-10">

        {/* Section header */}
        <div className="mx-auto max-w-xl text-center mb-10 sm:mb-16">
          <h2 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl lg:text-5xl">
            Our Simple Pricing Plan
          </h2>
          <p className="mt-3 text-gray-500">
            Transparent pricing — no hidden fees, ever.
          </p>
        </div>

        {/* 3-column card grid — all cards identical, red header + white text on hover */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3 sm:gap-5 sm:items-stretch">
          {plans.map((p) => (
            <div
              key={p.tag}
              className="group flex flex-col rounded-2xl overflow-hidden border border-gray-100 shadow-md shadow-gray-200/60 bg-white transition-all duration-300 hover:shadow-xl hover:shadow-[#C10007]/10 hover:border-[#C10007]/20"
            >
              {/* Card header — gray-50 by default, red on hover */}
              <div className="p-6 sm:p-7 bg-gray-50 border-b border-gray-100 transition-colors duration-300 group-hover:bg-[#C10007] group-hover:border-[#C10007]">
                <p className="text-[10px] font-bold uppercase tracking-widest leading-snug text-[#C10007] transition-colors duration-300 group-hover:text-white/70">
                  {p.tag}
                </p>
                <div className="mt-3 flex items-baseline gap-1.5 flex-wrap">
                  <span className="text-4xl font-extrabold leading-none text-gray-900 transition-colors duration-300 group-hover:text-white">
                    {p.price}
                  </span>
                  <span className="text-xs font-medium text-gray-400 transition-colors duration-300 group-hover:text-white/50">
                    {p.extra}
                  </span>
                </div>
              </div>

              {/* Card body — identical across all cards */}
              <div className="flex flex-col flex-1 gap-6 p-6 sm:p-7 bg-white">
                <p className="flex-1 text-sm sm:text-[15px] leading-relaxed text-gray-500">
                  {p.blurb}
                </p>
                <Link
                  href="/intake"
                  className="group/cta inline-flex items-center justify-center gap-2 rounded-sm px-5 py-3.5 text-sm font-semibold border border-gray-200 text-gray-600 transition-all duration-200 active:scale-[0.97] hover:bg-[#C10007] hover:border-[#C10007] hover:!text-white"
                >
                  {p.cta}
                  <svg
                    className="w-3.5 h-3.5 transition-transform duration-200 group-hover/cta:translate-x-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
                    />
                  </svg>
                </Link>
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}

// ─── Testimonials ─────────────────────────────────────────────────────────────
function Testimonials() {
  const featured = testimonials[0];
  const rest = testimonials.slice(1);

  if (!featured) return null;

  return (
    <section className="bg-white py-16">
      <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
        <div className="mb-12 sm:mb-16 text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl lg:text-5xl">
            Closing Made Easy.{" "}
            <span className="text-[#C10007]">Just Ask Our Clients.</span>
          </h2>
        </div>

        {/* Featured full-width red quote card */}
        <div className="relative mb-6 overflow-hidden rounded-3xl bg-[#C10007] p-8 sm:p-10 lg:p-14">
          <div className="pointer-events-none absolute right-0 top-0 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-10 -left-10 h-48 w-48 rounded-full bg-white/5 blur-2xl" />
          <span className="relative block text-5xl sm:text-6xl font-black leading-none text-white/30">
            &ldquo;
          </span>
          <p className="relative mt-3 max-w-3xl text-lg sm:text-xl lg:text-2xl font-light leading-relaxed text-white">
            {featured.text}
          </p>
          <div className="relative mt-7 flex items-center gap-4">
            <div
              className="flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-full bg-white/20 text-base sm:text-lg font-bold text-white"
            >
              {featured.name[0]}
            </div>
            <div>
              <p className="font-semibold text-white">{featured.name}</p>
              <p className="text-white/60 text-sm">{"★".repeat(featured.stars)}</p>
            </div>
          </div>
        </div>

        {/* Grid of remaining testimonials */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {rest.map((t) => (
            <div
              key={t.name}
              className="flex flex-col rounded-2xl border border-gray-100 bg-gray-50 p-5 sm:p-6"
            >
              <p className="flex-1 text-sm leading-relaxed text-gray-600">
                &ldquo;{t.text}&rdquo;
              </p>
              <div className="mt-5 flex items-center gap-3">
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ backgroundColor: t.bg }}
                >
                  {t.name[0]}
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-800">
                    {t.name}
                  </p>
                  <p className="text-[10px] text-[#C10007]">
                    {"★".repeat(t.stars)}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Why Choose ───────────────────────────────────────────────────────────────
function WhyChoose() {
  return (
    <section className="bg-gray-50 py-16 ">
      <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
        <div className="mb-12 sm:mb-16 text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl lg:text-5xl">
            Why Choose iClosed over your
            <br className="hidden sm:block" /> brick-and-mortar law firms?
          </h2>
        </div>

        {/* Column header labels */}
        <div className="mx-auto mb-3 grid max-w-5xl grid-cols-[1fr_60px_60px] sm:grid-cols-[1fr_90px_90px] gap-3 sm:gap-4 px-3 sm:px-6">
          <span className="text-xs font-bold uppercase tracking-widest text-gray-400">
            What&apos;s Covered
          </span>
          <span className="text-center text-sm font-bold text-[#C10007]">
            iClosed
          </span>
          <span className="text-center text-sm font-bold capitalize  text-gray-400">
            Traditional law firms
          </span>
        </div>

        {/* Feature rows */}
        <div className="mx-auto max-w-5xl space-y-2">
          {features.map((f) => (
            <div
              key={f.title}
              className="grid grid-cols-[1fr_60px_60px] sm:grid-cols-[1fr_90px_90px] items-center gap-3 sm:gap-4 rounded-xl bg-white px-4 sm:px-5 py-4 sm:py-5 shadow-sm ring-1 ring-gray-100 transition-shadow hover:shadow-md"
            >
              <div className="pr-2 sm:pr-4">
                <h3 className="text-sm sm:text-base font-semibold text-gray-900">
                  {f.title}
                </h3>
                <p className="mt-1 text-xs sm:text-sm leading-relaxed text-gray-500">
                  {f.desc}
                </p>
              </div>
              {/* iClosed check */}
              {/* iClosed check */}
              <div className="flex justify-center">
                <span className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full bg-[#C10007]/10">
                  <Check className="w-4 h-4 sm:w-5 sm:h-5 text-[#C10007] stroke-[2]" />
                </span>
              </div>

              {/* Traditional */}
              <div className="flex justify-center">
                <span className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full bg-gray-100">
                  <X className="w-4 h-4 sm:w-5 sm:h-5 text-gray-300 stroke-[3]" />
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom CTA */}
        <div className="mt-14 sm:mt-16 text-center">
          <Link
            href="/intake"
            className="inline-block rounded-lg bg-[#C10007] px-10 sm:px-12 py-3.5 sm:py-4 text-base font-semibold !text-white shadow-lg shadow-[#C10007]/20 transition-colors hover:bg-[#a00006]"
          >
            Start your closing today
          </Link>
        </div>
      </div>
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function Home() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <TrustedBy />
        <HowItWorks />
        <Pricing />
        <Testimonials />
        <WhyChoose />
      </main>
    </>
  );
}

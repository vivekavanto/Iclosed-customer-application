"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const AUTOPLAY_MS = 4500;

type Shot = { src: string; alt: string };

type Tab = {
  short: string;
  title: string;
  desc: string;
  shots: Shot[];
};

const tabs: Tab[] = [
  {
    short: "Intake",
    title: "Fill out our intake",
    desc: "Choose your service, upload your signed Agreement of Purchase and Sale, and confirm the property details. Our AI reads your documents and populates the file automatically, so there is very little left for you to type.",
    shots: [
      { src: "/process/intake-1-service.png", alt: "Choosing a service and seeing the price up front" },
      { src: "/process/intake-2-agreement.png", alt: "Uploading the Agreement of Purchase and Sale and supporting documents" },
      { src: "/process/intake-3-purchase.png", alt: "Purchase price, deposit, closing date and property address" },
      { src: "/process/intake-4-sale.png", alt: "Sale price, deposit, closing date and property address" },
    ],
  },
  {
    short: "Purchase",
    title: "Everything your purchase needs",
    desc: "Your purchase file lists every outstanding task in one place — identification, personal information, mortgage representative details and home insurance — and each one opens as a guided form you complete online.",
    shots: [
      { src: "/process/purchase-1-dashboard.png", alt: "Purchase dashboard listing outstanding tasks and status overview" },
      { src: "/process/purchase-2-identification.png", alt: "Uploading identification documents, with a camera capture option" },
      { src: "/process/purchase-3-personal-info.png", alt: "Personal information form covering property use, citizenship and source of funds" },
    ],
  },
  {
    short: "Sale",
    title: "Everything your sale needs",
    desc: "A sale file tracks its own set of tasks, from your mortgage statement and latest property tax bill through to rental equipment, your direct deposit form and the lockbox code.",
    shots: [
      { src: "/process/sale-1-dashboard.png", alt: "Sale dashboard listing outstanding tasks and status overview" },
      { src: "/process/sale-2-property-tax.png", alt: "Uploading the latest property tax bill and confirming whether it is paid" },
      { src: "/process/sale-3-rental-equipment.png", alt: "Recording rental equipment such as a hot water tank or furnace" },
    ],
  },
  {
    short: "Co-seller",
    title: "Buying or selling together",
    desc: "Closing with someone else? Set how you will hold title and each owner's share, then decide who uploads the documents — you, your partner, or each of you uploading your own.",
    shots: [
      { src: "/process/coseller-1-ownership.png", alt: "Choosing joint tenancy or tenants in common and setting ownership shares" },
      { src: "/process/coseller-2-who-uploads.png", alt: "Choosing who will upload documents for the file" },
    ],
  },
];

export default function ProcessSlider() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState(0);
  const [shot, setShot] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  const active = tabs[tab] ?? tabs[0];
  const shotCount = active.shots.length;

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const scrollToShot = useCallback((i: number, smooth: boolean) => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollTo({
      left: i * track.clientWidth,
      behavior: smooth ? "smooth" : "auto",
    });
  }, []);

  // Switching tabs swaps the whole track, so rewind it — the shot index itself
  // is reset by the tab button, since state belongs in the handler not here.
  useEffect(() => {
    scrollToShot(0, false);
  }, [tab, scrollToShot]);

  // Keep the active shot in sync when the viewer swipes the track directly.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!track.clientWidth) return;
        setShot(Math.round(track.scrollLeft / track.clientWidth));
      });
    };
    track.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      track.removeEventListener("scroll", onScroll);
    };
  }, []);

  // Auto-advance within the current tab, looping back to its first shot.
  useEffect(() => {
    if (reducedMotion || paused || shotCount < 2) return;
    const id = setTimeout(() => {
      scrollToShot((shot + 1) % shotCount, true);
    }, AUTOPLAY_MS);
    return () => clearTimeout(id);
  }, [shot, shotCount, paused, reducedMotion, scrollToShot]);

  const step = (delta: number) => {
    const next = Math.max(0, Math.min(shot + delta, shotCount - 1));
    scrollToShot(next, true);
  };

  return (
    <section className="bg-white py-16" aria-label="A walkthrough of the iClosed process">
      <div className="mx-auto max-w-6xl px-4 sm:px-8 lg:px-10">

        {/* Centered section header */}
        <div className="mx-auto max-w-2xl text-center mb-10 sm:mb-12">
          <span className="inline-flex items-center gap-2.5 text-xs font-bold uppercase tracking-[0.2em] text-[#C10007]">
            <span className="block h-px w-8 bg-[#C10007]" />
            See it in action
            <span className="block h-px w-8 bg-[#C10007]" />
          </span>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl lg:text-5xl">
            A Look Inside iClosed
          </h2>
          <p className="mt-4 text-base sm:text-lg leading-relaxed text-gray-500">
            Every screen you will actually use, from your very first details all
            the way to your closing-day tasks.
          </p>
        </div>

        {/* Tab pills — horizontally scrollable on small screens */}
        <div className="mb-4 flex gap-2 overflow-x-auto pb-2 sm:justify-center [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map((t, i) => (
            <button
              key={t.short}
              type="button"
              onClick={() => {
                setTab(i);
                setShot(0);
              }}
              aria-current={i === tab}
              className={`shrink-0 rounded-full border px-4 py-2 text-xs sm:text-sm font-semibold tracking-wide transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C10007]/40 focus-visible:ring-offset-2 ${
                i === tab
                  ? "border-[#C10007] bg-[#C10007] text-white shadow-md shadow-[#C10007]/25"
                  : "border-gray-200 bg-gray-50 text-gray-500 hover:border-[#C10007]/30 hover:bg-white hover:text-[#C10007]"
              }`}
            >
              <span className="mr-1.5 font-extrabold opacity-60">{i + 1}</span>
              {t.short}
            </button>
          ))}
        </div>

        {/* What the selected tab shows — min-height keeps the frame from jumping between tabs */}
        <div className="mx-auto mb-6 max-w-2xl min-h-[140px] text-center sm:min-h-[112px]">
          <h3 className="text-lg sm:text-xl font-bold leading-snug text-gray-900">
            {active.title}
          </h3>
          <p className="mt-2 text-sm sm:text-[15px] leading-relaxed text-gray-500">
            {active.desc}
          </p>
        </div>

        {/* Screenshot frame — hovering or focusing it holds the current shot */}
        <div
          className="relative"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocusCapture={() => setPaused(true)}
          onBlurCapture={() => setPaused(false)}
        >
          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-lg shadow-gray-200/60">

            {/* Browser chrome bar */}
            <div className="flex items-center gap-1.5 border-b border-gray-100 bg-gray-50 px-4 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-gray-200" />
              <span className="h-2.5 w-2.5 rounded-full bg-gray-200" />
              <span className="h-2.5 w-2.5 rounded-full bg-gray-200" />
              <span className="ml-3 hidden truncate text-[11px] font-medium text-gray-400 sm:block">
                iclosed.ca — {active.short}
              </span>
            </div>

            <div
              ref={trackRef}
              className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {active.shots.map((s, i) => (
                <div
                  key={s.src}
                  className="relative h-[300px] w-full shrink-0 snap-center bg-gray-50 sm:h-[460px] lg:h-[560px]"
                  aria-hidden={i !== shot}
                >
                  <Image
                    src={s.src}
                    alt={s.alt}
                    fill
                    priority={tab === 0 && i === 0}
                    sizes="(max-width: 1024px) 100vw, 1024px"
                    className="object-contain object-top p-3 sm:p-5"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Prev / next — overlaid on the frame from small screens up */}
          <button
            type="button"
            onClick={() => step(-1)}
            disabled={shot === 0}
            aria-label="Previous screenshot"
            className="absolute left-2 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 shadow-md transition-all duration-200 hover:border-[#C10007]/30 hover:text-[#C10007] disabled:pointer-events-none disabled:opacity-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C10007]/40 sm:flex lg:-left-5"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            disabled={shot === shotCount - 1}
            aria-label="Next screenshot"
            className="absolute right-2 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 shadow-md transition-all duration-200 hover:border-[#C10007]/30 hover:text-[#C10007] disabled:pointer-events-none disabled:opacity-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C10007]/40 sm:flex lg:-right-5"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {/* Dots for the shots inside this tab, plus mobile arrows */}
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => step(-1)}
            disabled={shot === 0}
            aria-label="Previous screenshot"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 transition-colors disabled:opacity-40 sm:hidden"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-2">
            {active.shots.map((s, i) => (
              <button
                key={s.src}
                type="button"
                onClick={() => scrollToShot(i, true)}
                aria-label={`Screenshot ${i + 1} of ${shotCount}`}
                aria-current={i === shot}
                className={`h-2 rounded-full transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C10007]/40 focus-visible:ring-offset-2 ${
                  i === shot ? "w-6 bg-[#C10007]" : "w-2 bg-gray-200 hover:bg-gray-300"
                }`}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={() => step(1)}
            disabled={shot === shotCount - 1}
            aria-label="Next screenshot"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 transition-colors disabled:opacity-40 sm:hidden"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>
    </section>
  );
}

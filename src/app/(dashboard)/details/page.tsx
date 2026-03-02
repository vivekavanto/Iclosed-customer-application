"use client";

import { Import } from "lucide-react";
import { useState } from "react";
import Button from "@/components/ui/Button";

/* ══════════════════════════════════════════════════════════════
   ICONS
══════════════════════════════════════════════════════════════ */

function IconWrap({ children, size = "md" }: { children: React.ReactNode; size?: "sm" | "md" }) {
  return (
    <div
      className={[
        "rounded-xl bg-[#fef5f5] flex items-center justify-center flex-shrink-0",
        size === "md" ? "w-10 h-10" : "w-8 h-8",
      ].join(" ")}
    >
      {children}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#c0392b" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  );
}

function MapPinIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#c0392b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c0392b" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  );
}

function GroupIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c0392b" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="7" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx="17" cy="8" r="2.5" />
      <path d="M19 20c0-2.8-2-5-4.5-5.5" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

/* ══════════════════════════════════════════════════════════════
   1. HERO BANNER  — status + key financial stats
══════════════════════════════════════════════════════════════ */

const keyStats = [
  { label: "Purchase Price", value: "$895,000" },
  { label: "Closing Date", value: "June 5, 2025" },
  { label: "Deposit Paid", value: "$50,000" },
];

function HeroBanner() {
  return (
    <div className="bg-white border border-[#f0e4e4] rounded-2xl overflow-hidden">
      <div className="flex flex-col lg:flex-row">

        {/* ── Left: status info ── */}
        <div className="flex-1 p-8">
          <div className="flex items-start gap-4 mb-5">
            <IconWrap>
              <CheckIcon />
            </IconWrap>
            <div className="pt-0.5">
              <span className="inline-flex items-center border border-[#27ae60] text-[#27ae60] text-[10px] font-bold px-3 py-0.5 rounded-full uppercase tracking-widest mb-2">
                Completed
              </span>
              <h1 className="text-[22px] font-bold text-[#1a1a1a] leading-snug">
                Your property closing is complete!
              </h1>
            </div>
          </div>

          <div className="pl-14 space-y-1 mb-6">
            <p className="text-[14px] font-semibold text-[#1a1a1a]">
              It&apos;s time to get your keys!
            </p>
            <p className="text-[13px] text-[#4a4a4a] leading-relaxed">
              We&apos;ve finalized your documents and confirmed how and where you&apos;ll receive your keys.
            </p>
          </div>

          <div className="pl-14">
            <Button className="px-6 py-2.5 text-[13px] font-semibold hover:bg-[#1a1a1a] hover:text-white transition-all duration-200 cursor-pointer">
              View Key Handover Details
            </Button>
          </div>
        </div>

        {/* ── Dividers ── */}
        <div className="hidden lg:block w-px bg-[#f0e4e4] my-8" />
        <div className="block lg:hidden h-px bg-[#f0e4e4] mx-8" />

        {/* ── Right: key stats panel ── */}
        <div className="lg:w-[300px] bg-[#fafafa] p-8 flex flex-row lg:flex-col justify-around lg:justify-center gap-0">
          {keyStats.map((stat, i) => (
            <div
              key={stat.label}
              className={[
                "text-center lg:text-left flex-1 lg:flex-none",
                i > 0 ? "lg:border-t lg:border-[#f0e4e4] lg:pt-5 lg:mt-5 border-l lg:border-l-0 border-[#f0e4e4] pl-4 lg:pl-0" : "",
              ].join(" ")}
            >
              <p className="text-[10px] text-[#888] uppercase tracking-widest font-semibold mb-1">
                {stat.label}
              </p>
              <p className="text-[20px] font-bold text-[#1a1a1a]">{stat.value}</p>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   2. PROPERTY CARD  — map + deal details
══════════════════════════════════════════════════════════════ */

function PropertyCard() {
  return (
    <div className="bg-white border border-[#f0e4e4] rounded-2xl p-6 flex flex-col gap-5">

      {/* Header */}
      <div className="flex items-center gap-3">
        <IconWrap><MapPinIcon /></IconWrap>
        <h2 className="text-[16px] font-bold text-[#1a1a1a]">Property and Deal Summary</h2>
      </div>

      {/* Map — tall + prominent */}
      <div className="rounded-xl overflow-hidden border border-[#f0e4e4]" style={{ height: "260px" }}>
        <iframe
          title="Property Location Map"
          width="100%"
          height="100%"
          style={{ border: 0 }}
          loading="lazy"
          src="https://www.openstreetmap.org/export/embed.html?bbox=-79.3405%2C43.6995%2C-79.3265%2C43.7095&layer=mapnik&marker=43.7045%2C-79.3335"
        />
      </div>

      {/* Address — highlighted card */}
      <div className="flex items-start gap-3 p-4 bg-[#fef5f5] rounded-xl border border-[#f0e4e4]">
        <div className="w-7 h-7 rounded-lg bg-white border border-[#f0e4e4] flex items-center justify-center flex-shrink-0 mt-0.5">
          <MapPinIcon size={14} />
        </div>
        <div>
          <p className="text-[10px] text-[#c0392b] uppercase tracking-widest font-bold mb-0.5">
            Property Address
          </p>
          <p className="text-[13px] font-semibold text-[#1a1a1a] leading-snug">
            102 Maplewood Drive, Toronto, ON M4B 1G7, Canada
          </p>
        </div>
      </div>

      {/* Offer date — inline pill row */}
      <div className="flex items-center justify-between px-4 py-3 border border-[#f0e4e4] rounded-xl">
        <p className="text-[12px] text-[#888] font-medium uppercase tracking-wide">Offer Date</p>
        <p className="text-[13px] font-semibold text-[#1a1a1a]">February 12, 2025</p>
      </div>

    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   3. PROFILE CARD
══════════════════════════════════════════════════════════════ */

const profileFields = [
  { label: "Phone number", value: "+1 (647) 555-1234" },
  { label: "Marital status", value: "Married" },
  { label: "Business phone number", value: "NA" },
  { label: "Current address", value: "102 Maplewood Drive, Toronto, ON M4B 1G7, Canada" },
  {
    label: "In the past 365 days, have you lived outside of Canada for 183 or more days?",
    value: "Yes",
  },
  {
    label: 'What is your citizenship status? (If multiple purchasers, please specify for each purchaser in "Other"):',
    value: "Canadian Citizen",
  },
  {
    label: "Is this your primary residence or is it an investment property?",
    value: "Primary",
  },
  {
    label: 'Have you (or your spouse) ever owned a property? if multiple purchasers, please specify history for each person in "Other":.',
    value: "No (first time)",
  },
];

function ProfileCard() {
  return (
    <div className="bg-white border border-[#f0e4e4] rounded-2xl p-6 flex flex-col gap-5">

      {/* Header */}
      <div className="flex items-center gap-3">
        <IconWrap><UserIcon /></IconWrap>
        <h2 className="text-[16px] font-bold text-[#1a1a1a]">Your Profile Details</h2>
      </div>

      {/* Fields */}
      <div className="flex flex-col divide-y divide-[#f0e4e4]">
        {profileFields.map((field) => (
          <div key={field.label} className="py-3 first:pt-0 last:pb-0">
            <p className="text-[11px] text-[#888] font-semibold leading-snug mb-0.5 uppercase tracking-wide">
              {field.label}
            </p>
            <p className="text-[13px] font-semibold text-[#1a1a1a] leading-snug">
              {field.value}
            </p>
          </div>
        ))}
      </div>

    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   4. PEOPLE CARD  — avatar chips in a grid
══════════════════════════════════════════════════════════════ */

const purchasers = [
  { name: "John Doe (You)", role: "Purchaser", initials: "JD", bg: "#c0392b" },
  { name: "Jessica Martin", role: "Purchaser", initials: "JM", bg: "#c0392b" },
  { name: "Daniel Reyes", role: "Co-Purchaser", initials: "DR", bg: "#c0392b" },
];

const partners = [
  { name: "MapleTrust Realty Inc.", role: "Real Estate Brokerage", initials: "MR", bg: "#c0392b" },
  { name: "Harpreet K. Gill", role: "Real Estate Agent", initials: "HK", bg: "#c0392b" },
  { name: "Emily R. Thomas", role: "Mortgage Advisor", initials: "ER", bg: "#c0392b" },
];

function PersonChip({
  name, role, initials, bg,
}: {
  name: string; role: string; initials: string; bg: string;
}) {
  return (
    <div className="group flex items-center gap-4 p-5 border border-[#f0e4e4] rounded-xl hover:border-[#c0392b] hover:shadow-[0_2px_12px_rgba(192,57,43,0.08)] transition-all duration-200 cursor-pointer">
      <div
        className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 text-white font-bold text-[13px] tracking-wide"
        style={{ backgroundColor: bg }}
      >
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-semibold text-[#1a1a1a] truncate">{name}</p>
        <p className="text-[12px] text-[#888] mt-0.5">{role}</p>
      </div>
      <button className="flex items-center gap-1 text-[12px] font-semibold text-[#4a4a4a] group-hover:text-[#c0392b] transition-colors whitespace-nowrap cursor-pointer">
        More Info <ChevronRightIcon />
      </button>
    </div>
  );
}

function PeopleCard() {
  const [activeTab, setActiveTab] = useState<"purchasers" | "partners">("purchasers");

  return (
    <div className="bg-white border border-[#f0e4e4] rounded-2xl p-6">

      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <IconWrap><GroupIcon /></IconWrap>
          <h2 className="text-[16px] font-bold text-[#1a1a1a]">People Involved in This Deal!</h2>
        </div>

        {/* Segmented tab control */}
        <div className="flex bg-[#f5f5f5] rounded-xl p-1 self-start sm:self-auto">
          {(["purchasers", "partners"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={[
                "px-5 py-1.5 rounded-lg text-[12px] font-semibold capitalize transition-all duration-200 cursor-pointer",
                activeTab === tab
                  ? "bg-white text-[#1a1a1a] shadow-sm"
                  : "text-[#888] hover:text-[#4a4a4a]",
              ].join(" ")}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* People grid */}
      {activeTab === "purchasers" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {purchasers.map((p) => (
            <PersonChip key={p.name} {...p} />
          ))}
        </div>
      ) : partners.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {partners.map((p) => (
            <PersonChip key={p.name} {...p} />
          ))}
        </div>
      ) : (
        <div className="flex items-center justify-center py-14 text-[13px] text-[#888]">
          No partners listed for this deal.
        </div>
      )}

    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   PAGE
══════════════════════════════════════════════════════════════ */

export default function DetailsPage() {
  return (
    <div className="-mx-4 -my-8 min-h-[calc(100vh-56px)] ">
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-5">

        <HeroBanner />

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-5 items-start">
          <PropertyCard />
          <ProfileCard />
        </div>

        <PeopleCard />

      </div>
    </div>
  );
}

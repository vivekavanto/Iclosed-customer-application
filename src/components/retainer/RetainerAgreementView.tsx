import type { RetainerAgreement } from "@/lib/retainerAgreement";

const RED = "#B3211E";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-8 text-sm font-bold uppercase tracking-wide" style={{ color: RED }}>
      {children}
    </h2>
  );
}

function FeeTable({ rows, head }: { rows: { label: string; amount: string }[]; head?: boolean }) {
  return (
    <div className="mt-3 overflow-hidden rounded-md text-sm">
      {head && (
        <div className="flex justify-between bg-gray-200 px-3 py-2.5 font-bold text-gray-900">
          <span>If this happens</span>
          <span>Fee</span>
        </div>
      )}
      {rows.map((r, i) => (
        <div
          key={r.label}
          className={`flex items-start justify-between gap-4 px-3 py-2.5 ${i % 2 === 0 ? "bg-gray-50" : "bg-white"}`}
        >
          <span className="text-gray-700">{r.label}</span>
          <span className="whitespace-nowrap text-right font-bold text-gray-900">{r.amount}</span>
        </div>
      ))}
    </div>
  );
}

/** The v9 purchase or sale retainer body, above the signature form. */
export default function RetainerAgreementView({
  agreement,
  badge,
}: {
  agreement: RetainerAgreement;
  badge?: React.ReactNode;
}) {
  const a = agreement;

  return (
    <div className="px-6 pt-8 pb-4 sm:px-10 sm:pt-10 lg:px-16 lg:pt-12">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">{a.title}</h1>
          <p className="mt-2 text-sm text-gray-500">{a.meta.join("  ·  ")}</p>
        </div>
        {badge}
      </div>

      <div className="mt-6 space-y-3 text-[15px] leading-relaxed text-gray-700">
        {a.sections.map((s) => (
          <p key={s.label}>
            <strong className="text-gray-900">{s.label}</strong> {s.body}
          </p>
        ))}
      </div>

      <SectionTitle>Your fees</SectionTitle>
      <FeeTable rows={a.fees} />
      <p className="mt-3 text-sm leading-relaxed text-gray-500">{a.feeNote}</p>

      <SectionTitle>If something changes</SectionTitle>
      <p className="mt-2 text-sm leading-relaxed text-gray-500">{a.changesIntro}</p>
      <FeeTable rows={a.changes} head />

      <SectionTitle>Definitions</SectionTitle>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-gray-700">
        {a.definitions.map((s) => (
          <p key={s.label}>
            <strong className="text-gray-900">{s.label}</strong> {s.body}
          </p>
        ))}
      </div>

      <p className="mt-8 font-bold leading-relaxed text-gray-900">{a.acceptance}</p>
    </div>
  );
}

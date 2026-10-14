import { redirect } from "next/navigation";

// Legacy direct link: /signing/AT. Booking links now live at
// /book-appointment/AT, so links already sent to clients keep working — the
// visitor is redirected and any prefill query (name, email, closingDate, …) is
// carried across. See src/app/(public)/book-appointment/[lawyerInitials].

export default async function LegacySigningLinkPage({
  params,
  searchParams,
}: {
  params: Promise<{ lawyerInitials: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { lawyerInitials } = await params;
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      qs.append(key, v);
    }
  }
  const query = qs.toString();
  redirect(`/book-appointment/${encodeURIComponent(lawyerInitials)}${query ? `?${query}` : ""}`);
}

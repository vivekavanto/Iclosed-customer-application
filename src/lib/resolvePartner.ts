import type { SupabaseClient } from "@supabase/supabase-js";

import { buildReferralCode } from "@/lib/referralCode";

// Partners (referral sources) live in the shared `partners` table. When a client
// keys in an agent/broker at intake instead of using a referral code, we resolve
// them here: link to an existing partner by email, or create a new one with an
// auto-generated referral code so they appear on the admin Partners page, accrue
// client counts (leads.partner_id), and their new code validates for future
// clients.
//
// The referral-code generation MUST stay in lockstep with the admin panel, which
// reads/writes the same table. The scheme itself now lives in lib/referralCode.ts
// (first name + the second name's initial + the year, SARUJANK2026), mirrored
// verbatim from D:\iclosed_dev_admin\src\lib\referralCode.ts. Only the
// read-codes / insert / 23505-retry dance around it is repeated per repo.

// Map the intake "How did you hear about us?" value onto the partners
// .brokerage_type CHECK constraint ('Real Estate Agent' | 'Mortgage Broker').
// Returns null for any non-partner source, signalling the caller to skip partner
// creation.
export function partnerTypeFromSource(
  source?: string | null,
): "Real Estate Agent" | "Mortgage Broker" | null {
  const s = (source ?? "").toLowerCase();
  if (s.includes("agent")) return "Real Estate Agent";
  if (s.includes("broker")) return "Mortgage Broker";
  return null;
}

interface PartnerInput {
  name?: string | null;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  type: "Real Estate Agent" | "Mortgage Broker";
}

// Find-or-create a partner for a keyed-in agent/broker. Returns the partner's
// id, or null when there's no email to dedup on (caller keeps the free-text
// referral_agent_* fields only). Throws on unexpected DB errors — the intake
// caller wraps this so a failure never blocks the submission.
export async function findOrCreatePartner(
  supabase: SupabaseClient,
  { name, company, email, phone, type }: PartnerInput,
): Promise<{ id: string } | null> {
  const normalizedEmail = (email ?? "").trim();
  // No email → no reliable dedup key; skip creation to avoid duplicate partners.
  if (!normalizedEmail) return null;

  const emailLower = normalizedEmail.toLowerCase();

  // 1. Link to an existing partner if one already uses this email (case-
  //    insensitive, non-deleted). Never mutate their stored name/company/type.
  const { data: existing, error: lookupError } = await supabase
    .from("partners")
    .select("id, agent_email")
    .eq("is_deleted", false);
  if (lookupError) throw lookupError;

  const match = (existing ?? []).find(
    (r) => (r.agent_email ?? "").trim().toLowerCase() === emailLower,
  );
  if (match) return { id: match.id };

  // 2. Create a new partner with a name-derived referral code. The read spans
  //    soft-deleted rows too, so a retired code is never reissued and a name
  //    collision extends into the second name instead — matching the admin
  //    panel, which reads the same set before building a code.
  const { data: codes, error: codesError } = await supabase
    .from("partners")
    .select("referral_code");
  if (codesError) throw codesError;

  const taken = new Set<string>();
  for (const row of codes ?? []) {
    const code = (row.referral_code ?? "").trim().toUpperCase();
    if (code) taken.add(code);
  }

  // Fall back to the email local-part if the name is blank.
  const partnerName = (name ?? "").trim() || normalizedEmail.split("@")[0] || "Partner";

  for (let attempt = 1; attempt <= 10; attempt++) {
    const referral_code = buildReferralCode({
      name: partnerName,
      email: normalizedEmail,
      taken,
    });
    const { data, error } = await supabase
      .from("partners")
      .insert([
        {
          agent_name: partnerName,
          agent_email: normalizedEmail,
          agent_phone: (phone ?? "").trim() || null,
          brokerage_name: (company ?? "").trim() || null,
          brokerage_type: type,
          referral_code,
        },
      ])
      .select("id")
      .single();

    if (!error) return { id: data.id };
    // Unique violation on referral_code — another insert took this code; retry
    // with it marked as taken so the next candidate is a longer one.
    if (error.code === "23505") {
      taken.add(referral_code.toUpperCase());
      continue;
    }
    throw error;
  }

  throw new Error("Could not generate a unique referral code after 10 attempts.");
}

import type { SupabaseClient } from "@supabase/supabase-js";

// Partners (referral sources) live in the shared `partners` table. When a client
// keys in an agent/broker at intake instead of using a referral code, we resolve
// them here: link to an existing partner by email, or create a new one with an
// auto-generated referral code so they appear on the admin Partners page, accrue
// client counts (leads.partner_id), and their new code validates for future
// clients.
//
// The referral-code generation MUST stay in lockstep with the admin panel, which
// reads/writes the same table. Canonical source mirrored here:
//   D:\iclosed_dev_admin\src\app\api\admin\partners\route.ts (derivePrefix + the
//   globally-sequential number + 23505 retry). Keep both in sync.

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

// Derive the code prefix from the partner's first name (fallback: email
// local-part, fallback: PTNR). Uppercased letters only, capped at 8 chars.
function derivePrefix(name?: string | null, email?: string | null): string {
  const firstToken = (name ?? "").trim().split(/\s+/)[0] ?? "";
  const emailLocal = (email ?? "").split("@")[0] ?? "";
  const source = firstToken || emailLocal || "PTNR";
  const cleaned = source.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 8);
  return cleaned || "PTNR";
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

  // 2. Create a new partner with a globally-sequential referral code. The
  //    sequence spans soft-deleted rows too, so a retired code is never
  //    reissued — matching the admin panel's nextSequenceBase().
  const prefix = derivePrefix(name, normalizedEmail);
  const { data: codes, error: codesError } = await supabase
    .from("partners")
    .select("referral_code");
  if (codesError) throw codesError;

  let maxNum = 0;
  for (const row of codes ?? []) {
    const m = /(\d+)$/.exec(row.referral_code ?? "");
    if (!m) continue;
    const n = parseInt(m[1], 10);
    if (!isNaN(n) && n > maxNum) maxNum = n;
  }

  // Fall back to the email local-part if the name is blank.
  const partnerName = (name ?? "").trim() || normalizedEmail.split("@")[0] || "Partner";

  for (let attempt = 1; attempt <= 10; attempt++) {
    const referral_code = `${prefix}${String(maxNum + attempt).padStart(4, "0")}`;
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
    // Unique violation on referral_code — another insert took this number; retry.
    if (error.code === "23505") continue;
    throw error;
  }

  throw new Error("Could not generate a unique referral code after 10 attempts.");
}

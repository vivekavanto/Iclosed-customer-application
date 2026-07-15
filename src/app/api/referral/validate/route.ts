import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";

// Validate a referral code entered on the intake Contact step.
//
// A referral code lives directly on the partner record (partners.referral_code)
// — each partner created in the admin "Partners" panel gets their own code (e.g.
// PAVITHRA0003). partners_referral_code_unique_idx enforces one live code per
// partner, so a code resolves to exactly one partner.
//
// Attribution only — no discount is computed here; the intake flow just records
// the resolved partner id.
//
// GET /api/referral/validate?code=JANE2024
//   -> { valid: true, code, partner: {...} }
//   -> { valid: false, error }   (200 — an unknown code is not a server error)

type PartnerOut = {
  id: string;
  agent_name: string | null;
  agent_email: string | null;
  agent_phone: string | null;
  brokerage_type: "Mortgage Broker" | "Real Estate Agent" | null;
  brokerage_name: string | null;
};

const PARTNER_COLUMNS =
  "id, agent_name, agent_email, agent_phone, brokerage_type, brokerage_name";

const INVALID = {
  valid: false as const,
  error: "That referral code isn't valid. Check with your agent or broker.",
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = (searchParams.get("code") ?? "").trim();

  if (!code) {
    return NextResponse.json({ valid: false, error: "Enter a referral code." }, { status: 400 });
  }

  // Case-insensitive exact match. Escape ILIKE wildcards so a code containing
  // % _ \ is matched literally, not as a pattern.
  const escaped = code.replace(/[\\%_]/g, "\\$&");

  const { data: partner, error } = await supabaseAdmin
    .from("partners")
    .select(`${PARTNER_COLUMNS}, referral_code`)
    .ilike("referral_code", escaped)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ valid: false, error: error.message }, { status: 500 });
  }

  if (!partner) {
    return NextResponse.json(INVALID, { status: 200 });
  }

  const { referral_code, ...partnerOut } = partner;
  return NextResponse.json({
    valid: true,
    code: referral_code,
    partner: partnerOut as PartnerOut,
  });
}

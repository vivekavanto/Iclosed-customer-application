import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";

// Validate a referral code entered on the intake Contact step.
//
// A referral code lives directly on the broker/partner record
// (brokers.referral_code) — each partner created in the admin "Partners & Codes"
// panel gets their own code (e.g. PAVITHRA0003). Matching a code therefore
// resolves to exactly one broker.
//
// Legacy fallback: older partners were linked to a shared coupon via
// brokers.coupon_id and the code lived on coupons.code. We still resolve those
// so codes issued before the per-broker migration keep working.
//
// Attribution only — no discount is computed here; the coupon's discount fields
// are returned for reference but the intake flow just records the ids.
//
// GET /api/referral/validate?code=JANE2024
//   -> { valid: true, coupon: {...}, brokers: [{...}] }
//   -> { valid: false, error }   (200 — an unknown code is not a server error)

type BrokerOut = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  type: "Mortgage Broker" | "Real Estate Agent" | null;
  company: string | null;
};

const BROKER_COLUMNS = "id, name, email, phone, type, company";

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

  // --- Primary path: code stored on the broker record ---------------------
  const { data: broker, error: brokerErr } = await supabaseAdmin
    .from("brokers")
    .select(`${BROKER_COLUMNS}, referral_code, coupon_id`)
    .ilike("referral_code", escaped)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (brokerErr) {
    return NextResponse.json({ valid: false, error: brokerErr.message }, { status: 500 });
  }

  if (broker) {
    const { referral_code, coupon_id, ...brokerOut } = broker;
    return NextResponse.json({
      valid: true,
      // The code lives on the broker; expose it in the coupon shape the client
      // already consumes (id may be null when there's no linked coupon).
      coupon: { id: coupon_id ?? null, code: referral_code },
      brokers: [brokerOut as BrokerOut],
    });
  }

  // --- Legacy fallback: code stored on a shared coupon --------------------
  const { data: coupon, error: couponErr } = await supabaseAdmin
    .from("coupons")
    .select("id, code, discount_type, discount_value")
    .ilike("code", escaped)
    .eq("is_active", true)
    .eq("is_deleted", false)
    .maybeSingle();

  if (couponErr) {
    return NextResponse.json({ valid: false, error: couponErr.message }, { status: 500 });
  }

  if (!coupon) {
    return NextResponse.json(INVALID, { status: 200 });
  }

  // Brokers referred by this coupon (one coupon -> many brokers). The client
  // resolves which one referred them when there's more than a single match.
  const { data: brokers, error: couponBrokerErr } = await supabaseAdmin
    .from("brokers")
    .select(BROKER_COLUMNS)
    .eq("coupon_id", coupon.id)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false });

  if (couponBrokerErr) {
    return NextResponse.json({ valid: false, error: couponBrokerErr.message }, { status: 500 });
  }

  return NextResponse.json({
    valid: true,
    coupon,
    brokers: (brokers ?? []) as BrokerOut[],
  });
}

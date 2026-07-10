import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";

// Validate a referral (coupon) code entered on the intake Contact step.
//
// A referral code IS a coupon code. Brokers point at a shared coupon via
// brokers.coupon_id, so a valid code resolves to a coupon plus 0..N brokers.
// The client picks the referring broker when more than one is linked.
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

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = (searchParams.get("code") ?? "").trim();

  if (!code) {
    return NextResponse.json({ valid: false, error: "Enter a referral code." }, { status: 400 });
  }

  // Case-insensitive exact match on the coupon code. Escape ILIKE wildcards so a
  // code containing % _ \ is matched literally, not as a pattern. Only active,
  // non-deleted coupons count (mirrors the coupons_code_unique_idx predicate).
  const escaped = code.replace(/[\\%_]/g, "\\$&");
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
    return NextResponse.json(
      { valid: false, error: "That referral code isn't valid. Check with your agent or broker." },
      { status: 200 },
    );
  }

  // Brokers referred by this coupon (one coupon -> many brokers). The client
  // resolves which one referred them when there's more than a single match.
  const { data: brokers, error: brokerErr } = await supabaseAdmin
    .from("brokers")
    .select("id, name, email, phone, type, company")
    .eq("coupon_id", coupon.id)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false });

  if (brokerErr) {
    return NextResponse.json({ valid: false, error: brokerErr.message }, { status: 500 });
  }

  return NextResponse.json({
    valid: true,
    coupon,
    brokers: (brokers ?? []) as BrokerOut[],
  });
}

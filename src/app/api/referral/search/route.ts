import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";

// Search existing partners (referral sources) by name for the intake Contact
// step's "How did you hear about us?" → agent/broker autocomplete.
//
// When a client has no referral code and keys in an agent/broker, they can now
// pick a matching existing partner instead of re-typing details that create a
// duplicate. Selecting a result links the intake straight to that partner_id;
// find-or-create (which only dedups on email) is bypassed.
//
// GET /api/referral/search?q=jane&type=Real%20Estate%20Agent
//   -> { partners: PartnerOut[] }   (up to 8, name-ordered)
//
// An empty q returns the first partners (name-ordered) so focusing the field
// surfaces suggestions. Attribution only — no code is resolved here.

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

const RESULT_LIMIT = 8;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const type = (searchParams.get("type") ?? "").trim();

  let query = supabaseAdmin
    .from("partners")
    .select(PARTNER_COLUMNS)
    .eq("is_deleted", false);

  // Optionally scope to the source the client picked (agent vs. broker) so an
  // agent search doesn't surface mortgage brokers, and vice versa.
  if (type === "Real Estate Agent" || type === "Mortgage Broker") {
    query = query.eq("brokerage_type", type);
  }

  // Name contains `q` (case-insensitive). Escape ILIKE wildcards so a name with
  // % _ \ is matched literally, not as a pattern.
  if (q) {
    const escaped = q.replace(/[\\%_]/g, "\\$&");
    query = query.ilike("agent_name", `%${escaped}%`);
  }

  const { data, error } = await query
    .order("agent_name", { ascending: true })
    .limit(RESULT_LIMIT);

  if (error) {
    return NextResponse.json(
      { partners: [], error: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ partners: (data ?? []) as PartnerOut[] });
}

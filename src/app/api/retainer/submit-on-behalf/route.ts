import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { getAuthClient } from "@/lib/getAuthClient";
import { resolveRetainerLeadId } from "@/lib/retainerToken";

/**
 * POST /api/retainer/submit-on-behalf
 *
 * Persists the primary applicant's answer to the post-retainer-sign popup
 * "Want to help with your co-purchaser(s) paperwork?".
 *
 *   submit_on_behalf true  → "Yes, I'll upload on their behalf"
 *   submit_on_behalf false → "No, they will upload themselves"
 *
 * The answer is written to leads.submit_on_behalf on the PRIMARY lead row
 * (parent_lead_id IS NULL). It's one decision per deal — see
 * sql/add_lead_submit_on_behalf.sql.
 *
 * Signer is identified the same two ways as /api/retainer/sign and /check:
 *   • token → account-free retainer link, maps to exactly one lead.
 *   • else  → the logged-in client.
 *
 * Body: { token?: string, submit_on_behalf: boolean }
 */
export async function POST(req: Request) {
  try {
    const { token, submit_on_behalf } = (await req.json()) as {
      token?: string;
      submit_on_behalf?: boolean;
    };

    if (typeof submit_on_behalf !== "boolean") {
      return NextResponse.json(
        { success: false, error: "submit_on_behalf must be a boolean" },
        { status: 400 }
      );
    }

    // Resolve the signer's lead id (mirrors /api/retainer/sign).
    let leadId: string | null = null;

    if (token) {
      leadId = await resolveRetainerLeadId(token);
      if (!leadId) {
        return NextResponse.json(
          { success: false, error: "This retainer link is invalid or has expired." },
          { status: 401 }
        );
      }
    } else {
      const client = await getAuthClient();
      if (!client) {
        return NextResponse.json(
          { success: false, error: "Not authenticated" },
          { status: 401 }
        );
      }

      const { data: deals } = await supabaseAdmin
        .from("deals")
        .select("lead_id, status")
        .eq("client_id", client.id)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false });

      const NON_CONVERTED_DEAL_STATUSES = new Set(["Pending"]);
      const leadIds = (deals || [])
        .filter((d) => !NON_CONVERTED_DEAL_STATUSES.has(d.status))
        .map((d) => d.lead_id)
        .filter(Boolean);

      if (leadIds.length === 0) {
        return NextResponse.json(
          { success: false, error: "No converted deals found for this account" },
          { status: 404 }
        );
      }

      // The decision belongs to the PRIMARY lead (parent_lead_id IS NULL).
      const { data: primaryLead } = await supabaseAdmin
        .from("leads")
        .select("id")
        .in("id", leadIds)
        .is("parent_lead_id", null)
        .limit(1)
        .maybeSingle();

      leadId = primaryLead?.id ?? null;
    }

    if (!leadId) {
      return NextResponse.json(
        { success: false, error: "No primary lead found" },
        { status: 404 }
      );
    }

    // Only the primary lead carries this decision. The guard keeps a co-person's
    // token from ever flipping the flag on their own (non-primary) row.
    const { error } = await supabaseAdmin
      .from("leads")
      .update({ submit_on_behalf })
      .eq("id", leadId)
      .is("parent_lead_id", null);

    if (error) {
      console.error("[Retainer submit-on-behalf] update error:", error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Retainer submit-on-behalf] error:", err);
    return NextResponse.json(
      { success: false, error: "Server error" },
      { status: 500 }
    );
  }
}

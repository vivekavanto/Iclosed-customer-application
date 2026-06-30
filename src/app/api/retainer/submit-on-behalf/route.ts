import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { getAuthClient } from "@/lib/getAuthClient";
import { resolveRetainerLeadId } from "@/lib/retainerToken";
import { sendInviteEmail } from "@/lib/sendInviteEmail";

/**
 * POST /api/retainer/submit-on-behalf
 *
 * Persists the primary applicant's answer to the post-retainer-sign popup
 * "Who will be uploading your documents?".
 *
 *   "Me"            → the primary uploads everyone's documents.
 *   "My co-purchaser" → the chosen co-purchaser/co-seller uploads the primary's
 *                       documents and their own.
 *   "Both"          → the primary and the co-person(s) each upload their own.
 *
 * The answer is modelled with leads.submit_on_behalf: the flag is set to TRUE on
 * whichever family member is the designated uploader (the primary for "Me", the
 * chosen co-person for "My co-purchaser") and FALSE on every other member —
 * exactly one uploader per family. A "family" is the primary lead plus all leads
 * with parent_lead_id = primary.id. See sql/add_lead_submit_on_behalf.sql.
 *
 * The choice ALSO decides which co-persons receive an account-activation email.
 * Co-persons are not invited at conversion (see convertLead.ts) — they are
 * invited here based on `mode`:
 *   "me"   → no co-person is invited (the primary uploads for everyone).
 *   "co"   → only the chosen co-person (the designated uploader) is invited.
 *   "both" → every co-person is invited (each uploads their own documents).
 * The primary always already has portal access (invited at conversion).
 *
 * The caller is always the PRIMARY (the popup is primary-only), identified the
 * same two ways as /api/retainer/sign and /check:
 *   • token → account-free retainer link, maps to exactly one lead.
 *   • else  → the logged-in client.
 *
 * Body: { token?: string, uploader_lead_id: string, mode?: "me" | "co" | "both" }
 *   uploader_lead_id must be the primary lead or one of its co-person leads.
 *   mode drives which co-persons are emailed an activation link (see above).
 */
export async function POST(req: Request) {
  try {
    const { token, uploader_lead_id, mode } = (await req.json()) as {
      token?: string;
      uploader_lead_id?: string;
      mode?: "me" | "co" | "both";
    };

    if (!uploader_lead_id || typeof uploader_lead_id !== "string") {
      return NextResponse.json(
        { success: false, error: "uploader_lead_id is required" },
        { status: 400 }
      );
    }

    // Resolve the caller's (primary) lead id (mirrors /api/retainer/sign).
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

    // The decision is primary-only. Confirm the resolved caller is a true primary
    // (no parent) — a co-person's token must never drive this choice.
    const { data: callerLead } = await supabaseAdmin
      .from("leads")
      .select("id, parent_lead_id")
      .eq("id", leadId)
      .maybeSingle();

    if (!callerLead || callerLead.parent_lead_id != null) {
      return NextResponse.json(
        { success: false, error: "Only the primary applicant can set this." },
        { status: 403 }
      );
    }

    // Family = the primary plus every co-person linked to it. The chosen uploader
    // must be one of them (never a client-supplied id from another transaction).
    const { data: coRows } = await supabaseAdmin
      .from("leads")
      .select("id")
      .eq("parent_lead_id", leadId);
    const familyIds = [leadId, ...((coRows ?? []).map((c) => c.id))];

    if (!familyIds.includes(uploader_lead_id)) {
      return NextResponse.json(
        { success: false, error: "Selected uploader is not part of this transaction." },
        { status: 400 }
      );
    }

    // Exactly one designated uploader: TRUE on the chosen lead, FALSE on the rest.
    const others = familyIds.filter((id) => id !== uploader_lead_id);
    if (others.length > 0) {
      const { error: clearErr } = await supabaseAdmin
        .from("leads")
        .update({ submit_on_behalf: false })
        .in("id", others);
      if (clearErr) {
        console.error("[Retainer submit-on-behalf] clear error:", clearErr);
        return NextResponse.json(
          { success: false, error: clearErr.message },
          { status: 500 }
        );
      }
    }

    const { error } = await supabaseAdmin
      .from("leads")
      .update({ submit_on_behalf: true })
      .eq("id", uploader_lead_id);

    if (error) {
      console.error("[Retainer submit-on-behalf] update error:", error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    // Consent audit: when the uploader is a co-person ("My co-purchaser" → the
    // primary clicked "I agree"), record proof of the permission grant on the
    // primary lead. Picking "Me" is not a delegation, so clear any prior consent.
    //
    // upload_mode is persisted on the primary alongside the consent so downstream
    // routes can tell "me" from "both" (both leave submit_on_behalf on the
    // primary) — see sql/add_lead_upload_mode.sql. Fall back to deriving the mode
    // from the uploader when the client didn't send one.
    const isDelegation = uploader_lead_id !== leadId;
    const resolvedMode: "me" | "co" | "both" =
      mode ?? (isDelegation ? "co" : "me");
    const { error: consentErr } = await supabaseAdmin
      .from("leads")
      .update(
        isDelegation
          ? {
              upload_mode: resolvedMode,
              upload_consent_at: new Date().toISOString(),
              upload_consent_uploader_lead_id: uploader_lead_id,
            }
          : {
              upload_mode: resolvedMode,
              upload_consent_at: null,
              upload_consent_uploader_lead_id: null,
            }
      )
      .eq("id", leadId);

    if (consentErr) {
      console.error("[Retainer submit-on-behalf] consent update error:", consentErr);
      return NextResponse.json(
        { success: false, error: consentErr.message },
        { status: 500 }
      );
    }

    // ── Co-person account-activation emails, gated by the primary's choice ──
    // The primary already has portal access (invited at conversion). Co-persons
    // were intentionally NOT invited then, so we send their activation email now
    // based on who will upload documents:
    //   "me"   → invite nobody else (the primary uploads for everyone).
    //   "co"   → invite only the chosen co-person (the designated uploader).
    //   "both" → invite every co-person (each uploads their own).
    // Best-effort and non-blocking: the uploader choice is already persisted, so
    // a failed/slow email must never fail the request.
    const coPersonIds = familyIds.filter((id) => id !== leadId);
    let inviteLeadIds: string[] = [];
    if (mode === "both") {
      inviteLeadIds = coPersonIds;
    } else if (mode === "co") {
      // Invite the selected uploader, but only when it's an actual co-person.
      inviteLeadIds = uploader_lead_id !== leadId ? [uploader_lead_id] : [];
    }

    if (inviteLeadIds.length > 0) {
      const portalBase = (
        process.env.NEXT_PUBLIC_CUSTOMER_PORTAL_URL ??
        "https://iclosed-customer-application-rosy.vercel.app"
      ).replace(/\/+$/, "");
      const redirectTo = `${portalBase}/api/auth/callback?next=/set-password`;

      await Promise.all(
        inviteLeadIds.map(async (coLeadId) => {
          try {
            const invite = await sendInviteEmail(coLeadId, redirectTo);
            // Link the new auth user to the co-person's client so leadHasAccount
            // (account_exists) reports true once they've been invited.
            if (invite.authUserId) {
              const { data: coLead } = await supabaseAdmin
                .from("leads")
                .select("client_id")
                .eq("id", coLeadId)
                .maybeSingle();
              if (coLead?.client_id) {
                await supabaseAdmin
                  .from("clients")
                  .update({ auth_user_id: invite.authUserId })
                  .eq("id", coLead.client_id);
              }
            }
            if (!invite.success) {
              console.error(
                "[Retainer submit-on-behalf] co-person invite failed for",
                coLeadId,
                invite.error
              );
            }
          } catch (inviteErr) {
            console.error(
              "[Retainer submit-on-behalf] co-person invite error for",
              coLeadId,
              inviteErr
            );
          }
        })
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

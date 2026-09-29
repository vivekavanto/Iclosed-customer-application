import { randomBytes } from "node:crypto";
import supabaseAdmin from "@/lib/supabaseAdmin";

// Mirrors the admin app's createRetainerSignToken: ~10-year, account-free link.
const TTL_MS = 3650 * 24 * 60 * 60 * 1000;

/** Reuses the lead's live retainer_sign token, or mints one. Null on failure. */
export async function getOrCreateRetainerToken(opts: {
  leadId: string;
  email: string;
  retainerUrl: string;
}): Promise<string | null> {
  const { leadId, email, retainerUrl } = opts;

  const { data: existing } = await supabaseAdmin
    .from("invitation_tokens")
    .select("token, expires_at")
    .eq("type", "retainer_sign")
    .eq("user_data->>lead_id", leadId)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing?.token) return existing.token as string;

  const token = randomBytes(48).toString("base64url");
  const { error } = await supabaseAdmin.from("invitation_tokens").insert({
    token,
    email,
    type: "retainer_sign",
    redirect_to: retainerUrl,
    user_data: { lead_id: leadId, side: "", primary_lead_id: leadId, kind: "retainer_sign" },
    expires_at: new Date(Date.now() + TTL_MS).toISOString(),
  });
  if (error) {
    console.error("[QuoteRetainer] token insert failed for lead:", leadId, error.message);
    return null;
  }
  return token;
}

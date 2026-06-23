import supabaseAdmin from "./supabaseAdmin";

/**
 * Whether the person behind a lead already has a portal account.
 *
 * "Has an account" == their customer record (public.clients) carries an
 * `auth_user_id`. That's the same signal getAuthClient, convertLead, and the
 * retainer-activate webhook use (the webhook switches an "Activate Account"
 * invite to a login link the moment auth_user_id exists). Account-free retainer
 * signers are pre-account, so this is false for genuinely new clients and the
 * portal can decide whether to show the "Activate your account" popup.
 *
 * Resolves the client by client_id first, then by email (mirrors how the
 * activate webhook falls back), so it works even before the lead↔client link
 * is back-filled.
 */
export async function leadHasAccount(
  lead: { client_id?: string | null; email?: string | null } | null | undefined,
): Promise<boolean> {
  if (!lead) return false;

  if (lead.client_id) {
    const { data } = await supabaseAdmin
      .from("clients")
      .select("auth_user_id")
      .eq("id", lead.client_id)
      .maybeSingle();
    if (data?.auth_user_id) return true;
  }

  if (lead.email) {
    const emailPattern = String(lead.email).replace(/[\\%_]/g, "\\$&");
    const { data } = await supabaseAdmin
      .from("clients")
      .select("auth_user_id")
      .ilike("email", emailPattern)
      .maybeSingle();
    if (data?.auth_user_id) return true;
  }

  return false;
}

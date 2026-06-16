import supabaseAdmin from "./supabaseAdmin";

/**
 * Resolve a retainer-sign token to the lead it's for.
 *
 * The admin app mints these tokens (type 'retainer_sign') into the shared
 * `invitation_tokens` table and emails a link `/retainer?token=<token>`. The
 * token is the credential for the account-free signing flow: it maps to exactly
 * one lead and is unguessable. The lead id lives in `user_data.lead_id`.
 *
 * Returns the lead id, or null if the token is missing / wrong type / expired.
 * (Retainer tokens are minted effectively non-expiring, but we still honour
 * expires_at if it's ever set.)
 */
export async function resolveRetainerLeadId(
  token: string | null | undefined,
): Promise<string | null> {
  if (!token) return null;

  const { data, error } = await supabaseAdmin
    .from("invitation_tokens")
    .select("type, user_data, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (error || !data) return null;
  if (data.type !== "retainer_sign") return null;
  if (
    data.expires_at &&
    new Date(data.expires_at as string).getTime() < Date.now()
  ) {
    return null;
  }

  const ud = (data.user_data ?? {}) as Record<string, unknown>;
  const leadId = ud.lead_id ? String(ud.lead_id) : null;
  return leadId;
}

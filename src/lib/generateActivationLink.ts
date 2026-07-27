import supabaseAdmin from "@/lib/supabaseAdmin";

/** The set-password page stamps `password_set: true` on user_metadata once the
 *  user actually saves a password. generateLink returns the full user record, so
 *  we can read that flag off whichever call (invite/recovery) returned the user. */
function isPasswordSet(user: { user_metadata?: Record<string, unknown> | null } | null | undefined): boolean {
  return user?.user_metadata?.password_set === true;
}

export interface ActivationLinkResult {
  action_link: string | null;
  /**
   * True when this user has already completed activation (their password is set).
   * Set on the auth user's user_metadata by the set-password page. Lets the
   * activate route send a returning click to reset-password instead of
   * set-password. False for brand-new / not-yet-activated users.
   */
  passwordSet: boolean;
  error: string | null;
}

/**
 * Mints a one-time Supabase auth action link (set-password) for a lead WITHOUT
 * sending any email. Use this for the "Activate your account now" choice, where
 * the user is redirected straight into the set-password page — no email needed.
 *
 * Mirrors the link generation in sendInviteEmail.ts: a first-time email gets an
 * "invite" link; an email that already has an auth account gets a "recovery"
 * link. The redirectTo should be the portal's auth callback that forwards to
 * /set-password (e.g. `${portal}/api/auth/callback?next=/set-password`).
 *
 * Sending an email is the caller's job (see sendInviteEmail.ts for the "I'll do
 * this later" path) — generateLink only RETURNS the link, it never emails.
 */
export async function generateActivationLink(
  leadId: string,
  redirectTo: string,
): Promise<ActivationLinkResult> {
  try {
    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("email, first_name, last_name")
      .eq("id", leadId)
      .single();

    if (!lead?.email) {
      return { action_link: null, passwordSet: false, error: "Lead has no email" };
    }

    const invite = await supabaseAdmin.auth.admin.generateLink({
      type: "invite",
      email: lead.email,
      options: {
        redirectTo,
        data: { first_name: lead.first_name, last_name: lead.last_name ?? "" },
      },
    });

    if (invite.data?.properties?.action_link) {
      return {
        action_link: invite.data.properties.action_link,
        passwordSet: isPasswordSet(invite.data.user),
        error: null,
      };
    }

    // Email already has an account → recovery link instead of invite.
    const recovery = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: lead.email,
      options: { redirectTo },
    });

    if (recovery.data?.properties?.action_link) {
      return {
        action_link: recovery.data.properties.action_link,
        passwordSet: isPasswordSet(recovery.data.user),
        error: null,
      };
    }

    return {
      action_link: null,
      passwordSet: false,
      error:
        recovery.error?.message ??
        invite.error?.message ??
        "Failed to generate activation link",
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error generating activation link";
    return { action_link: null, passwordSet: false, error: message };
  }
}

import supabaseAdmin from "@/lib/supabaseAdmin";

export interface ActivationLinkResult {
  action_link: string | null;
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
      return { action_link: null, error: "Lead has no email" };
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
      return { action_link: invite.data.properties.action_link, error: null };
    }

    // Email already has an account → recovery link instead of invite.
    const recovery = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: lead.email,
      options: { redirectTo },
    });

    if (recovery.data?.properties?.action_link) {
      return { action_link: recovery.data.properties.action_link, error: null };
    }

    return {
      action_link: null,
      error:
        recovery.error?.message ??
        invite.error?.message ??
        "Failed to generate activation link",
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error generating activation link";
    return { action_link: null, error: message };
  }
}

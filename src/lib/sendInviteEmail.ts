import supabaseAdmin from "@/lib/supabaseAdmin";
import { resend, EMAIL_FROM, EMAIL_REPLY_TO } from "@/lib/resend";
import { renderMilestoneTemplate, resolveTemplateSubject } from "@/lib/email-templates/milestone";

export interface SendInviteEmailResult {
  success: boolean;
  authUserId: string | null;
  error: string | null;
}

/**
 * Generates a Supabase auth link (invite for new users, recovery for existing
 * users) and emails it via Resend using the admin-managed "invite user"
 * template from the email_templates table. Replaces Supabase Auth's built-in
 * invite email so the body, subject, and styling stay editable from the admin
 * dashboard like every other email.
 *
 * The {{ confirmation_url }} placeholder in the template body is replaced
 * with the secure one-time link that Supabase generates per call.
 */
export async function sendInviteEmail(
  leadId: string,
  redirectTo: string,
): Promise<SendInviteEmailResult> {
  try {
    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("id, first_name, last_name, email, lead_type, address_street, address_city")
      .eq("id", leadId)
      .single();

    if (!lead?.email) {
      return { success: false, authUserId: null, error: "Lead has no email" };
    }

    let actionLink: string | null = null;
    let authUserId: string | null = null;

    const inviteResult = await supabaseAdmin.auth.admin.generateLink({
      type: "invite",
      email: lead.email,
      options: {
        redirectTo,
        data: { first_name: lead.first_name, last_name: lead.last_name ?? "" },
      },
    });

    if (inviteResult.data?.properties?.action_link) {
      actionLink = inviteResult.data.properties.action_link;
      authUserId = inviteResult.data.user?.id ?? null;
    } else {
      const errCode = (inviteResult.error as { code?: string } | null)?.code;
      const errMsg = inviteResult.error?.message?.toLowerCase() ?? "";
      const isExistingUser =
        errCode === "user_already_exists" ||
        errCode === "email_exists" ||
        errMsg.includes("already registered") ||
        errMsg.includes("already exists");

      if (isExistingUser) {
        const recoveryResult = await supabaseAdmin.auth.admin.generateLink({
          type: "recovery",
          email: lead.email,
          options: { redirectTo },
        });

        if (recoveryResult.data?.properties?.action_link) {
          actionLink = recoveryResult.data.properties.action_link;
          authUserId = recoveryResult.data.user?.id ?? null;
        } else {
          return {
            success: false,
            authUserId: null,
            error: recoveryResult.error?.message ?? "Failed to generate recovery link",
          };
        }
      } else {
        return {
          success: false,
          authUserId: null,
          error: inviteResult.error?.message ?? "Failed to generate invite link",
        };
      }
    }

    const { data: template } = await supabaseAdmin
      .from("email_templates")
      .select("name, subject, body")
      .ilike("name", "invite user%")
      .eq("is_active", true)
      .or("is_deleted.eq.false,is_deleted.is.null")
      .limit(1)
      .maybeSingle();

    if (!template?.body) {
      return {
        success: false,
        authUserId,
        error: "Invite email template not found in email_templates (name like 'invite user%', is_active=true)",
      };
    }

    const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(" ");
    const leadAddress = [lead.address_street, lead.address_city].filter(Boolean).join(", ");

    const variables: Record<string, string> = {
      "user.first_name": lead.first_name || "",
      "user.last_name": lead.last_name || "",
      "user.get_full_name": fullName || "there",
      "first_name": lead.first_name || "there",
      "lead_type": lead.lead_type || "property",
      "lead_address": leadAddress || "your property",
      "confirmation_url": actionLink ?? "",
      "invite_link": actionLink ?? "",
    };

    const html = renderMilestoneTemplate(template.body, variables);
    const subject = resolveTemplateSubject(template, variables, "You have been invited to iClosed");

    const { error: sendError } = await resend.emails.send({
      from: EMAIL_FROM,
      replyTo: EMAIL_REPLY_TO,
      to: lead.email,
      subject,
      html,
    });

    if (sendError) {
      return {
        success: false,
        authUserId,
        error: sendError.message ?? "Resend send failed",
      };
    }

    console.log("[InviteEmail] Sent to", lead.email, "for lead", leadId);
    return { success: true, authUserId, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error sending invite email";
    console.error("[InviteEmail] Error for lead", leadId, ":", err);
    return { success: false, authUserId: null, error: message };
  }
}

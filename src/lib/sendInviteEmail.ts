import supabaseAdmin from "@/lib/supabaseAdmin";
import { resend, EMAIL_FROM, EMAIL_REPLY_TO } from "@/lib/resend";
import { renderMilestoneTemplate, resolveTemplateSubject } from "@/lib/email-templates/milestone";
import { buildLeadAddressPartsForEmail, formatLeadTypeLabel } from "@/lib/leadEmailAddress";
import { splitCombinedAddressPhrase } from "@/lib/email-templates/splitCombinedAddressPhrase";

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
      .select(
        "id, parent_lead_id, first_name, last_name, email, lead_type, address_street, address_city, address_province, address_postal_code, selling_address_street, selling_address_city, selling_address_province, selling_address_postal_code",
      )
      .eq("id", leadId)
      .single();

    if (!lead?.email) {
      return { success: false, authUserId: null, error: "Lead has no email" };
    }

    let actionLink: string | null = null;
    let authUserId: string | null = null;
    // True when the email already has a Supabase auth account. Existing users
    // get the "Log into iClosed" email (login + password-reset links) instead
    // of the first-time "invite user" / set-password email.
    let isExistingUser = false;

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
      isExistingUser =
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

    const fetchTemplate = async (namePrefix: string) =>
      (
        await supabaseAdmin
          .from("email_templates")
          .select("name, subject, body")
          .ilike("name", namePrefix)
          .eq("is_active", true)
          .or("is_deleted.eq.false,is_deleted.is.null")
          .limit(1)
          .maybeSingle()
      ).data;

    const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(" ");
    const addressParts = await buildLeadAddressPartsForEmail(lead);
    const leadAddress = addressParts.combinedString;
    const leadType = formatLeadTypeLabel(lead.lead_type);

    // Existing users get the "Log into iClosed" template (login + reset links);
    // first-time users get the "invite user" template (set-password link). The
    // login button points at the portal /login page, derived from redirectTo so
    // we don't re-read the env here. The reset link is the one-time recovery
    // action link generated above.
    let template = isExistingUser ? await fetchTemplate("Log into iClosed%") : null;
    let fallbackSubject: string;

    const loginUrl = `${new URL(redirectTo).origin}/login`;

    const baseVariables: Record<string, string> = {
      "user.first_name": lead.first_name || "",
      "user.last_name": lead.last_name || "",
      "user.get_full_name": fullName || "there",
      "first_name": lead.first_name || "there",
      "lead_type": leadType || "property",
      "lead_address": leadAddress || "your property",
      "purchase_address": addressParts.purchase || leadAddress || "your property",
      "sale_address": addressParts.selling || "",
    };

    let variables: Record<string, string>;

    if (isExistingUser && template?.body) {
      fallbackSubject = "Log into your iClosed account";
      variables = {
        ...baseVariables,
        "login_url": loginUrl,
        "reset_url": actionLink ?? "",
        // alias so a template authored with {{ confirmation_url }} still resolves
        "confirmation_url": actionLink ?? "",
      };
    } else {
      // First-time user, OR existing user but the "Log into iClosed" template is
      // missing/inactive — fall back to the invite template so an email still goes out.
      if (isExistingUser) {
        console.warn(
          "[InviteEmail] 'Log into iClosed' template not found/inactive; falling back to invite-user template for",
          lead.email,
        );
      }
      template = await fetchTemplate("invite user%");
      if (!template?.body) {
        return {
          success: false,
          authUserId,
          error:
            "Invite email template not found in email_templates (name like 'invite user%', is_active=true)",
        };
      }
      fallbackSubject = "You have been invited to iClosed";
      variables = {
        ...baseVariables,
        "confirmation_url": actionLink ?? "",
        "invite_link": actionLink ?? "",
      };
    }

    const rawHtml = renderMilestoneTemplate(template.body, variables);
    // Match the welcome email: split combined "Purchase & Sale of A and B"
    // into "Purchase of A and Sale of B" in the body.
    const html = splitCombinedAddressPhrase(rawHtml, addressParts);
    const subject = resolveTemplateSubject(template, variables, fallbackSubject);

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

    console.log(
      "[InviteEmail] Sent",
      isExistingUser ? "(log-in)" : "(invite)",
      "to",
      lead.email,
      "for lead",
      leadId,
    );
    return { success: true, authUserId, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error sending invite email";
    console.error("[InviteEmail] Error for lead", leadId, ":", err);
    return { success: false, authUserId: null, error: message };
  }
}

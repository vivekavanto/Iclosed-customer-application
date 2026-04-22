import { resend, EMAIL_FROM, EMAIL_REPLY_TO } from "@/lib/resend";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { renderMilestoneTemplate } from "@/lib/email-templates/milestone";

const CITIZENSHIP_LABELS: Record<string, string> = {
  citizen: "Canadian citizen",
  permanent_resident: "Permanent resident",
  visa: "Visa",
  granted_refugee_status: "Granted refugee status in Canada",
  "non_citizen_&_unsure": "Non-Citizen or Unsure",
};

/**
 * Sends a citizenship-flag notification to the iClosed team inbox so
 * a law clerk can reach out to the client when they self-identify as
 * non-citizen / unsure during the Personal Information task.
 * Uses the "Citizenship Flag Notification" template from email_templates.
 */
export async function sendCitizenshipFlagEmail(
  dealId: string,
  citizenshipStatus: string,
): Promise<boolean> {
  try {
    const { data: deal } = await supabaseAdmin
      .from("deals")
      .select("id, lead_id")
      .eq("id", dealId)
      .single();

    if (!deal?.lead_id) {
      console.warn("[CitizenshipFlag] Deal or lead not found:", dealId);
      return false;
    }

    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select(
        "id, first_name, last_name, email, phone, lead_type, address_street, address_unit, address_city, address_province, address_postal_code, created_at",
      )
      .eq("id", deal.lead_id)
      .single();

    if (!lead) {
      console.warn("[CitizenshipFlag] Lead not found:", deal.lead_id);
      return false;
    }

    const { data: template, error: tmplErr } = await supabaseAdmin
      .from("email_templates")
      .select("name, body")
      .ilike("name", "%Citizenship Flag%")
      .eq("is_active", true)
      .or("is_deleted.eq.false,is_deleted.is.null")
      .limit(1)
      .maybeSingle();

    console.log("[CitizenshipFlag] template lookup:", {
      found: !!template?.body,
      name: template?.name,
      tmplErr: tmplErr?.message,
    });

    if (tmplErr || !template?.body) {
      console.error(
        "[CitizenshipFlag] Template not found. Check email_templates table for a row whose name contains 'Citizenship Flag', is_active=true, is_deleted=false.",
      );
      return false;
    }

    const fullName =
      [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "—";

    const purchaseAddress = [
      lead.address_street,
      lead.address_unit,
      lead.address_city,
      lead.address_province,
      lead.address_postal_code,
    ]
      .filter(Boolean)
      .join(", ");

    const submittedAt = new Date().toLocaleString("en-CA");

    const citizenshipLabel =
      CITIZENSHIP_LABELS[citizenshipStatus] || citizenshipStatus;

    const html = renderMilestoneTemplate(template.body, {
      full_name: fullName,
      email: lead.email || "—",
      phone: lead.phone || "—",
      lead_type: lead.lead_type || "—",
      citizenship_status: citizenshipLabel,
      purchase_address: purchaseAddress || "—",
      submitted_at: submittedAt,
    });

    const subject = `Citizenship Flag: ${fullName} — Non-citizen / unsure`;

    const { error } = await resend.emails.send({
      from: EMAIL_FROM,
      replyTo: EMAIL_REPLY_TO,
      to: EMAIL_REPLY_TO,
      subject,
      html,
    });

    if (error) {
      console.error("[CitizenshipFlag] Resend error:", error);
      return false;
    }

    console.log("[CitizenshipFlag] Sent for deal:", dealId);
    return true;
  } catch (err) {
    console.error("[CitizenshipFlag] Error for deal:", dealId, err);
    return false;
  }
}

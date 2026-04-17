import { resend, EMAIL_FROM, EMAIL_REPLY_TO } from "@/lib/resend";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { renderMilestoneTemplate } from "@/lib/email-templates/milestone";

/**
 * Sends a new-lead notification email to the iClosed team
 * so law clerks are notified when a new intake is completed.
 * Uses the "Lead Notification Email" template from the email_templates table.
 */
export async function sendLeadNotificationEmail(leadId: string): Promise<boolean> {
  try {
    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select(
        "id, first_name, last_name, email, phone, lead_type, service, sub_service, price, aps_signed, referral_source, address_street, address_unit, address_city, address_province, address_postal_code, selling_address_street, selling_address_unit, selling_address_city, selling_address_province, selling_address_postal_code, co_persons, created_at"
      )
      .eq("id", leadId)
      .single();

    if (!lead) {
      console.warn("[LeadNotification] Lead not found:", leadId);
      return false;
    }

    // Fetch the "Lead Notification Email" template from Supabase
    const { data: template, error: tmplErr } = await supabaseAdmin
      .from("email_templates")
      .select("name, body")
      .ilike("name", "%Lead Notification%")
      .eq("is_active", true)
      .or("is_deleted.eq.false,is_deleted.is.null")
      .limit(1)
      .maybeSingle();

    if (tmplErr || !template?.body) {
      console.error("[LeadNotification] Template not found in email_templates table");
      return false;
    }

    // ── Build variables for template ─────────────────────────
    const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "—";

    const purchaseAddress = [
      lead.address_street,
      lead.address_unit,
      lead.address_city,
      lead.address_province,
      lead.address_postal_code,
    ]
      .filter(Boolean)
      .join(", ");

    const sellingAddress = [
      lead.selling_address_street,
      lead.selling_address_unit,
      lead.selling_address_city,
      lead.selling_address_province,
      lead.selling_address_postal_code,
    ]
      .filter(Boolean)
      .join(", ");

    const priceFormatted =
      lead.price != null
        ? `$${Number(lead.price).toLocaleString("en-CA")}`
        : "—";

    const submittedAt = lead.created_at
      ? new Date(lead.created_at).toLocaleString("en-CA")
      : new Date().toLocaleString("en-CA");

    // ── Pre-rendered HTML for dynamic sections ───────────────
    const row = (label: string, value: string) => `
      <tr>
        <td style="padding: 6px 16px 6px 0; color:#555; white-space:nowrap; vertical-align:top;"><strong>${label}</strong></td>
        <td style="padding: 6px 0; vertical-align:top;">${value || "—"}</td>
      </tr>`;

    const leadDetailsTable = `
<table style="width:100%; border-collapse: collapse; font-size: 14px;">
  ${row("Name", fullName)}
  ${row("Email", lead.email || "—")}
  ${row("Phone", lead.phone || "—")}
  ${row("Transaction", lead.lead_type || "—")}
  ${row("Price", priceFormatted)}
  ${row("APS Signed", lead.aps_signed ? "Yes" : "No")}
  ${row("Referral", lead.referral_source || "—")}
  ${purchaseAddress ? row(lead.lead_type === "Sale" ? "Property" : "Purchase Address", purchaseAddress) : ""}
  ${sellingAddress ? row("Selling Address", sellingAddress) : ""}
</table>`;

    const coPersons: Array<{ fullName?: string; email?: string; phone?: string }> =
      Array.isArray(lead.co_persons) ? lead.co_persons : [];

    const coPersonsSection = coPersons.length
      ? `
<div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #eee;">
  <strong style="color:#C10007;">Co-Persons (${coPersons.length})</strong>
  <table style="width:100%; border-collapse: collapse; font-size: 14px; margin-top: 8px;">
    ${coPersons
      .map(
        (p, i) => `
      <tr>
        <td style="padding: 4px 12px 4px 0; color:#555; vertical-align:top;">#${i + 1}</td>
        <td style="padding: 4px 0;">
          ${p.fullName || "—"}<br>
          <span style="color:#888; font-size:12px;">${p.email || ""}${p.phone ? " · " + p.phone : ""}</span>
        </td>
      </tr>`
      )
      .join("")}
  </table>
</div>`
      : "";

    // ── Render template with all placeholders ────────────────
    const html = renderMilestoneTemplate(template.body, {
      full_name: fullName,
      lead_type: lead.lead_type || "—",
      email: lead.email || "—",
      phone: lead.phone || "—",
      price: priceFormatted,
      aps_signed: lead.aps_signed ? "Yes" : "No",
      referral_source: lead.referral_source || "—",
      purchase_address: purchaseAddress || "—",
      selling_address: sellingAddress || "—",
      submitted_at: submittedAt,
      lead_details_table: leadDetailsTable,
      co_persons_section: coPersonsSection,
    });

    const subject = `New Lead: ${fullName}${lead.lead_type ? ` — ${lead.lead_type}` : ""}`;

    const { error } = await resend.emails.send({
      from: EMAIL_FROM,
      replyTo: EMAIL_REPLY_TO,
      to: EMAIL_REPLY_TO, // iclosed@navawilson.law
      subject,
      html,
    });

    if (error) {
      console.error("[LeadNotification] Resend error:", error);
      return false;
    }

    console.log("[LeadNotification] Sent for lead:", leadId);
    return true;
  } catch (err) {
    console.error("[LeadNotification] Error for lead:", leadId, err);
    return false;
  }
}

import { resend, EMAIL_FROM, EMAIL_REPLY_TO } from "@/lib/resend";
import supabaseAdmin from "@/lib/supabaseAdmin";

export interface NameChangeRequestPayload {
  leadId: string;
  currentFirstName: string;
  currentLastName: string;
  requestedFirstName: string;
  requestedLastName: string;
  message?: string;
}

/**
 * Notifies the iClosed team inbox when a client requests a name change
 * from the Personal Information drawer.
 */
export async function sendNameChangeRequestEmail(
  payload: NameChangeRequestPayload,
): Promise<boolean> {
  try {
    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select(
        "id, first_name, last_name, email, phone, lead_type, address_street, address_unit, address_city, address_province, address_postal_code",
      )
      .eq("id", payload.leadId)
      .single();

    if (!lead) {
      console.warn("[NameChangeRequest] Lead not found:", payload.leadId);
      return false;
    }

    const { data: deal } = await supabaseAdmin
      .from("deals")
      .select("id, file_number")
      .eq("lead_id", payload.leadId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const currentName =
      [payload.currentFirstName, payload.currentLastName].filter(Boolean).join(" ") || "—";
    const requestedName =
      [payload.requestedFirstName, payload.requestedLastName].filter(Boolean).join(" ") || "—";

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

    const row = (label: string, value: string) => `
      <tr>
        <td style="padding: 6px 16px 6px 0; color:#555; white-space:nowrap; vertical-align:top;"><strong>${label}</strong></td>
        <td style="padding: 6px 0; vertical-align:top;">${value || "—"}</td>
      </tr>`;

    const html = `
      <div style="font-family: Arial, sans-serif; color: #111; line-height: 1.5;">
        <h2 style="margin: 0 0 16px; font-size: 18px;">Name Change Request</h2>
        <p style="margin: 0 0 16px;">
          A client has requested a name change through the Personal Information form.
        </p>
        <table style="border-collapse: collapse; width: 100%; max-width: 560px;">
          ${row("Current name", currentName)}
          ${row("Requested name", requestedName)}
          ${row("Client email", lead.email || "—")}
          ${row("Client phone", lead.phone || "—")}
          ${row("File number", deal?.file_number || "—")}
          ${row("Lead type", lead.lead_type || "—")}
          ${row("Property address", purchaseAddress || "—")}
          ${row("Additional message", payload.message?.trim() || "—")}
          ${row("Submitted at", submittedAt)}
        </table>
      </div>
    `;

    const subject = `Name Change Request: ${currentName} → ${requestedName}`;

    const { error } = await resend.emails.send({
      from: EMAIL_FROM,
      replyTo: lead.email || EMAIL_REPLY_TO,
      to: EMAIL_REPLY_TO,
      subject,
      html,
    });

    if (error) {
      console.error("[NameChangeRequest] Resend error:", error);
      return false;
    }

    console.log("[NameChangeRequest] Sent for lead:", payload.leadId);
    return true;
  } catch (err) {
    console.error("[NameChangeRequest] Error for lead:", payload.leadId, err);
    return false;
  }
}

import supabaseAdmin from "@/lib/supabaseAdmin";
import { renderMilestoneTemplate, resolveTemplateSubject } from "./milestone";

export async function buildRetainerEmailHtml(params: {
  firstName: string;
  propertyAddress: string;
  leadType: string;
  side?: "purchase" | "sale" | null;
  // When BOTH are provided, the email renders a combined P&S retainer
  // (both addresses listed, side label omitted).
  purchaseAddress?: string;
  saleAddress?: string;
}): Promise<{ html: string; subject: string }> {
  const {
    firstName,
    propertyAddress,
    leadType,
    side,
    purchaseAddress,
    saleAddress,
  } = params;

  const isCombined = Boolean(purchaseAddress && saleAddress);

  // For combined P&S retainers there is no single "side" — suppress the
  // legacy side label/suffix/row so the email doesn't mislabel the doc.
  const sideLabel = isCombined
    ? ""
    : side === "purchase"
      ? "Purchase Property"
      : side === "sale"
        ? "Sale Property"
        : "";
  const sideSuffix = sideLabel ? ` (${sideLabel})` : "";

  const propertyRoleRow = sideLabel
    ? `<tr>
      <td style="padding: 4px 12px 4px 0; font-weight: bold; color: #555;">Property Role:</td>
      <td style="padding: 4px 0;">${sideLabel}</td>
    </tr>`
    : "";

  // For combined P&S, render both addresses inside property_address so that
  // existing templates (which only know about {{property_address}}) still
  // show both properties. New templates can also use the structured
  // {{purchase_address}} / {{sale_address}} variables.
  const renderedPropertyAddress = isCombined
    ? `Purchase Property: ${purchaseAddress}<br />Sale Property: ${saleAddress}`
    : propertyAddress || "N/A";

  const { data: template, error } = await supabaseAdmin
    .from("email_templates")
    .select("name, subject, body")
    .ilike("name", "Retainer Agreement Signed%")
    .eq("is_active", true)
    .or("is_deleted.eq.false,is_deleted.is.null")
    .limit(1)
    .maybeSingle();

  if (error || !template?.body) {
    throw new Error(
      "'Retainer Agreement Signed' template not found in Supabase 'email_templates' table.",
    );
  }

  const variables: Record<string, string> = {
    "first_name": firstName || "there",
    "user.first_name": firstName || "there",
    "property_address": renderedPropertyAddress,
    "purchase_address": purchaseAddress || "",
    "sale_address": saleAddress || "",
    "lead_type": leadType || "N/A",
    "side_label": sideLabel,
    "side_suffix": sideSuffix,
    "property_role_row": propertyRoleRow,
  };

  const html = renderMilestoneTemplate(template.body, variables);
  const subject = resolveTemplateSubject(
    template,
    variables,
    `Your Signed Retainer Agreement${sideSuffix} — iClosed`,
  );

  return { html, subject };
}

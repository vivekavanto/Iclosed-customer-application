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

  // The "Property Role" label has been removed from the retainer email. The
  // subject suffix now carries the property address instead of the legacy
  // side label, and the Property Role row is no longer rendered in the body.
  const sideLabel = isCombined
    ? ""
    : side === "purchase"
      ? "Purchase Property"
      : side === "sale"
        ? "Sale Property"
        : "";

  // Subject suffix = the property address. For combined P&S retainers there is
  // no single address to show in the subject, so the suffix is suppressed.
  const subjectAddress = isCombined ? "" : (propertyAddress || "");
  const sideSuffix = subjectAddress ? ` (${subjectAddress})` : "";

  const propertyRoleRow = "";

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

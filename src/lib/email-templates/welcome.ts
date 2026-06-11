import supabaseAdmin from "@/lib/supabaseAdmin";
import { renderMilestoneTemplate, resolveTemplateSubject } from "./milestone";
import {
  buildLeadAddressPartsForEmail,
  formatLeadTypeLabelForRecipient,
} from "@/lib/leadEmailAddress";
import type { LeadAddressFields } from "@/lib/leadEmailAddress";
import { splitCombinedAddressPhrase } from "./splitCombinedAddressPhrase";

type WelcomeLead = LeadAddressFields & {
  first_name?: string | null;
  last_name?: string | null;
};

export async function buildWelcomeEmailHtml(params: {
  lead: WelcomeLead;
}): Promise<{ html: string; subject: string }> {
  const { lead } = params;

  const { data: template, error } = await supabaseAdmin
    .from("email_templates")
    .select("name, subject, body")
    .ilike("name", "Intake form completed%")
    .eq("is_active", true)
    .or("is_deleted.eq.false,is_deleted.is.null")
    .limit(1)
    .maybeSingle();

  if (error || !template?.body) {
    throw new Error("'Intake form completed' template not found in Supabase 'email_templates' table.");
  }

  const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(" ");
  // Combines purchase + selling addresses for Purchase & Sale leads (with a
  // family-sibling fallback when intake split the two sides across leads).
  // See src/lib/leadEmailAddress.ts.
  const addressParts = await buildLeadAddressPartsForEmail(lead);
  const leadAddress = addressParts.combinedString;
  const leadType = formatLeadTypeLabelForRecipient(lead);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://iclosed-customer-application-rosy.vercel.app";

  const variables = {
    "user.first_name": lead.first_name || "",
    "user.last_name": lead.last_name || "",
    "user.get_full_name": fullName || "there",
    "lead_type": leadType || "property",
    "lead_address": leadAddress || "your property",
    "first_name": lead.first_name || "there",
    "dashboard_link": `${siteUrl}/login`,
  };

  const rawHtml = renderMilestoneTemplate(template.body, variables);
  // For Purchase & Sale leads the template renders "the Purchase & Sale of
  // <purchase> and <selling>", which reads ambiguously. Rewrite the body
  // phrase to "Purchase of <purchase> and Sale of <selling>" without
  // touching the subject (which only shows the addresses).
  const html = splitCombinedAddressPhrase(rawHtml, addressParts);
  const subject = resolveTemplateSubject(template, variables, "Thank you for your inquiry");

  return { html, subject };
}

import supabaseAdmin from "@/lib/supabaseAdmin";
import { renderMilestoneTemplate } from "./milestone";

export async function buildWelcomeEmailHtml(params: {
  lead: any;
}): Promise<{ html: string; subject: string }> {
  const { lead } = params;

  // Fetch the "Welcome Email" template from Supabase
  const { data: template, error } = await supabaseAdmin
    .from("email_templates")
    .select("name, body")
    .ilike("name", "Welcome Email%")
    .eq("is_active", true)
    .or("is_deleted.eq.false,is_deleted.is.null")
    .limit(1)
    .maybeSingle();

  if (error || !template?.body) {
    throw new Error("Welcome Email template not found in Supabase 'email_templates' table.");
  }

  const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(" ");
  const leadAddress = [lead.address_street, lead.address_city].filter(Boolean).join(", ");

  const html = renderMilestoneTemplate(template.body, {
    "user.first_name": lead.first_name || "",
    "user.last_name": lead.last_name || "",
    "user.get_full_name": fullName || "there",
    "lead_type": lead.lead_type || "property",
    "lead_address": leadAddress || "your property",
    "first_name": lead.first_name || "there", // Fallback for old templates
    "dashboard_link": `${process.env.NEXT_PUBLIC_SITE_URL || "https://iclosed-customer-application-rosy.vercel.app/"}/login`
  });

  return { html, subject: template.name || "Welcome to iClosed!" };
}

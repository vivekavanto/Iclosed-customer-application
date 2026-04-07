import supabaseAdmin from "@/lib/supabaseAdmin";
import { renderMilestoneTemplate } from "./milestone";

export async function buildWelcomeEmailHtml(params: {
  firstName: string;
}): Promise<{ html: string; subject: string }> {
  const { firstName } = params;

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

  const html = renderMilestoneTemplate(template.body, {
    "user.first_name": firstName || "there",
    "first_name": firstName || "there",
    "dashboard_link": `${process.env.NEXT_PUBLIC_SITE_URL || "https://iclosed-customer-application-rosy.vercel.app/"}/login`
  });

  return { html, subject: template.name || "Welcome to iClosed!" };
}

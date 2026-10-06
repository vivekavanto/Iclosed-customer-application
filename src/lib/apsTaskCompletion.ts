import supabaseAdmin from "@/lib/supabaseAdmin";

/** True when the APS task asks more than the upload. */
export async function apsTaskHasQuestions(taskTemplateId: string | null | undefined): Promise<boolean> {
  if (!taskTemplateId) return false;
  const { data } = await supabaseAdmin
    .from("task_form_fields")
    .select("field_type, required, options, visible_when")
    .eq("task_template_id", taskTemplateId)
    .eq("required", true);
  return (data ?? []).some((f) => {
    if (f.field_type === "file" || f.field_type === "note") return false;
    const opts = f.options as { visible_when?: unknown } | null;
    // Conditional questions only count once shown.
    return !f.visible_when && !(opts && !Array.isArray(opts) && opts.visible_when);
  });
}

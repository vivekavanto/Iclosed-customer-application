import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";

/**
 * GET /api/task-form-fields?task_id=xxx
 *
 * Returns the form field definitions for a given task.
 * Resolves: task → task_template_id → task_form_fields
 *
 * Falls back to fuzzy title matching (trimmed, case-insensitive)
 * so it works even if task_template_id column is not yet present.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const task_id = searchParams.get("task_id");

    if (!task_id) {
      return NextResponse.json({ success: false, error: "task_id is required" }, { status: 400 });
    }

    // 1. Get the task — select task_template_id only if column exists (safe with try/catch)
    let task: any = null;
    try {
      const { data, error } = await supabaseAdmin
        .from("tasks")
        .select("id, title, task_template_id, completed, deal_id")
        .eq("id", task_id)
        .single();
      if (error) throw error;
      task = data;
    } catch {
      // task_template_id column might not exist yet — fallback select without it
      const { data, error } = await supabaseAdmin
        .from("tasks")
        .select("id, title, completed, deal_id")
        .eq("id", task_id)
        .single();
      if (error || !data) {
        return NextResponse.json({ success: false, error: "Task not found" }, { status: 404 });
      }
      task = data;
    }

    if (!task) {
      return NextResponse.json({ success: false, error: "Task not found" }, { status: 404 });
    }

    let templateId: string | null = task.task_template_id ?? null;

    // 2. If task_template_id is not set, match by trimmed title across all templates
    if (!templateId) {
      const cleanTitle = task.title?.trim()?.toLowerCase() ?? "";

      const { data: allTemplates } = await supabaseAdmin
        .from("task_templates")
        .select("id, name");

      const matched = (allTemplates ?? []).find(
        (t: any) => t.name?.trim()?.toLowerCase() === cleanTitle
      );

      templateId = matched?.id ?? null;

      console.log(`[task-form-fields] title="${task.title}" → matched template: ${templateId ?? "NONE"}`);
    }

    if (!templateId) {
      console.log(`[task-form-fields] No template found for task "${task.title}" — returning empty fields`);
      return NextResponse.json({ success: true, fields: [], task });
    }

    // 3. Fetch the form fields for this template
    const { data: fields, error: fieldsError } = await supabaseAdmin
      .from("task_form_fields")
      .select("id, field_type, label, placeholder, required, order_index, options")
      .eq("task_template_id", templateId)
      .order("order_index", { ascending: true });

    if (fieldsError) {
      return NextResponse.json({ success: false, error: fieldsError.message }, { status: 400 });
    }

    console.log(`[task-form-fields] Found ${fields?.length ?? 0} fields for template ${templateId}`);

    // 4. Fetch any existing responses so we can pre-fill the form
    const { data: existingResponses } = await supabaseAdmin
      .from("task_responses")
      .select("field_id, field_label, value, file_url, file_name")
      .eq("task_id", task_id);

    let finalResponses = existingResponses ?? [];

    // 5. Pre-fill from lead context if the fields haven't been answered yet
    if (task.deal_id && fields) {
      const { data: deal } = await supabaseAdmin
        .from("deals")
        .select("lead_id, property_address")
        .eq("id", task.deal_id)
        .single();
        
      if (deal?.lead_id) {
        const { data: lead } = await supabaseAdmin
          .from("leads")
          .select("*")
          .eq("id", deal.lead_id)
          .single();

        if (lead) {
          const prefillMapping: Record<string, string | null | undefined> = {
            "Phone Number": lead.phone,
            "Street Address": lead.address_street || deal.property_address,
            "City": lead.address_city,
            "Postal Code": lead.address_postal_code,
            "Marital Status": lead.marital_status,
            "Occupation": lead.occupation,
            "Citizenship Status": lead.citizenship_status,
            "Business/Employer Phone (Optional)": lead.employer_phone,
            "First Name": lead.first_name,
            "Last Name": lead.last_name,
            "Email": lead.email
          };

          fields.forEach((field) => {
            // Check if this field is already answered in existingResponses
            const hasAnswer = finalResponses.some(r => r.field_id === field.id);
            if (!hasAnswer) {
              const labelMatched = Object.keys(prefillMapping).find(
                key => field.label.trim().toLowerCase() === key.toLowerCase()
              );
              
              if (labelMatched && prefillMapping[labelMatched]) {
                finalResponses.push({
                  field_id: field.id,
                  field_label: field.label,
                  value: String(prefillMapping[labelMatched]),
                  file_url: null,
                  file_name: null
                });
              }
            }
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      task,
      fields: fields ?? [],
      existing_responses: finalResponses,
    });
  } catch (err) {
    console.error("GET /api/task-form-fields error:", err);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}

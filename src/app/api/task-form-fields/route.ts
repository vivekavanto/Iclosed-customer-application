import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";

type TaskFormField = {
  id: string;
  field_type: string;
  label: string;
  placeholder: string | null;
  required: boolean;
  order_index: number;
  options: any;
};

const normalizeLabel = (label: string | null | undefined): string =>
  (label ?? "").trim().toLowerCase().replace(/\s+/g, " ");

function normalizeMortgageDetailsFields(fields: TaskFormField[]): TaskFormField[] {
  const companyLabels = new Set([
    "company name",
    "mortgage representative company name",
    "mortgage representative/agent company name",
    "mortgage representative/agent company",
  ]);

  return fields
    .filter((field) => !companyLabels.has(normalizeLabel(field.label)))
    .map((field) => {
      const label = normalizeLabel(field.label);

      if (label === "status of mortgage") {
        return { ...field, label: "Mortage Representative Details" };
      }

      if (
        label === "mortgage representative name" ||
        label === "mortgage representative/agent name"
      ) {
        return { ...field, label: "Mortgage Representative/Agent Name", required: true };
      }

      if (
        label === "mortgage representative phone number" ||
        label === "mortgage representative/agent phone number"
      ) {
        return {
          ...field,
          label: "Mortgage Representative/Agent Phone Number",
          required: false,
        };
      }

      if (
        label === "mortgage representative email" ||
        label === "mortgage representative/agent email"
      ) {
        return { ...field, label: "Mortgage Representative/Agent Email", required: true };
      }

      return field;
    });
}

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

    let normalizedFields = (fields ?? []) as TaskFormField[];
    if ((task.title ?? "").trim().toLowerCase() === "mortgage details") {
      normalizedFields = normalizeMortgageDetailsFields(normalizedFields);
    }

    console.log(
      `[task-form-fields] Found ${normalizedFields.length} fields for template ${templateId}`
    );

    // 4. Fetch any existing responses so we can pre-fill the form
    const { data: existingResponses } = await supabaseAdmin
      .from("task_responses")
      .select("field_id, field_label, value, file_url, file_name")
      .eq("task_id", task_id);

    let finalResponses = existingResponses ?? [];

    // 5. Pre-fill from lead context if the fields haven't been answered yet
    if (task.deal_id && normalizedFields) {
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
          // The person's personal fields (marital/occupation/citizenship/
          // employer phone) are sourced from the CUSTOMER record (clients) —
          // the source of truth — resolved by client_id, else email. Falls back
          // to the lead during the transition (before the lead columns are
          // dropped). Name/phone/address keep their existing source.
          let person: any = null;
          const personCols =
            "marital_status, citizenship_status, occupation, employer_phone";
          if (lead.client_id) {
            const { data: c } = await supabaseAdmin
              .from("clients")
              .select(personCols)
              .eq("id", lead.client_id)
              .maybeSingle();
            person = c ?? null;
          }
          if (!person && lead.email) {
            const emailPattern = String(lead.email).replace(/[\\%_]/g, "\\$&");
            const { data: c } = await supabaseAdmin
              .from("clients")
              .select(personCols)
              .ilike("email", emailPattern)
              .maybeSingle();
            person = c ?? null;
          }

          const prefillMapping: Record<string, string | null | undefined> = {
            "Phone Number": lead.phone,
            "Street Address": lead.address_street || deal.property_address,
            "City": lead.address_city,
            "Postal Code": lead.address_postal_code,
            "Marital Status": person?.marital_status ?? null,
            "Occupation": person?.occupation ?? null,
            "Citizenship Status": person?.citizenship_status ?? null,
            "Business/Employer Phone (Optional)": person?.employer_phone ?? null,
            "First Name": lead.first_name,
            "Last Name": lead.last_name,
            "Email": lead.email
          };

          normalizedFields.forEach((field) => {
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
      fields: normalizedFields,
      existing_responses: finalResponses,
    });
  } catch (err) {
    console.error("GET /api/task-form-fields error:", err);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}

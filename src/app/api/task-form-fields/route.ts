import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { isPersonalInfoTask, isHoldTitleField } from "@/lib/taskKinds";
import { getFamilyPartyCount } from "@/lib/familyPartyCount";

/** `options` arrives as parsed JSONB, or as a JSON string in some setups. */
function parseOptions(opts: unknown): Record<string, unknown> {
  let parsed: unknown = opts;
  if (typeof opts === "string") {
    try {
      parsed = JSON.parse(opts);
    } catch {
      return {};
    }
  }
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

function isMultiPartyOnly(field: { label: string; options: unknown }): boolean {
  return (
    parseOptions(field.options).multi_party_only === true ||
    isHoldTitleField(field.label)
  );
}

/** Labels a field's visible_when depends on — one clause or an `all` array. */
function visibleWhenParents(opts: Record<string, unknown>): string[] {
  const vw = opts.visible_when as
    | { field_label?: string; all?: { field_label?: string }[] }
    | undefined;
  return (Array.isArray(vw?.all) ? vw.all : [vw])
    .map((c) => c?.field_label)
    .filter((l): l is string => !!l);
}

/**
 * The multi-party-only fields plus everything bound to them — the hold-title
 * question, its explainer badge, the ILA notice and the ownership-shares box.
 * They live or die together: showing the shares box without the question that
 * reveals it, or the ILA notice without its trigger, makes no sense.
 */
function multiPartyOnlyBlock<T extends { label: string; options: unknown }>(
  fields: T[]
): T[] {
  const flagged = fields.filter(isMultiPartyOnly);
  if (flagged.length === 0) return [];
  const names = new Set(flagged.map((f) => f.label.trim().toLowerCase()));
  // attach_to targets go too — a select's options can't carry the flag.
  const targets = new Set(
    flagged
      .map((f) => parseOptions(f.options).attach_to)
      .filter((t): t is string => typeof t === "string")
      .map((t) => t.trim().toLowerCase())
  );
  return fields.filter((f) => {
    if (isMultiPartyOnly(f)) return true;
    if (targets.has(f.label.trim().toLowerCase())) return true;
    const opts = parseOptions(f.options);
    const attachTo = typeof opts.attach_to === "string" ? opts.attach_to : null;
    if (attachTo && names.has(attachTo.trim().toLowerCase())) return true;
    return visibleWhenParents(opts).some((l) =>
      names.has(l.trim().toLowerCase())
    );
  });
}

// Fails open: an unresolvable party count keeps every field.
async function dropMultiPartyOnlyFields<T extends { label: string; options: unknown }>(
  fields: T[],
  leadId: string | null
): Promise<T[]> {
  const block = multiPartyOnlyBlock(fields);
  if (block.length === 0 || !leadId) return fields;

  const partyCount = await getFamilyPartyCount(leadId);
  if (partyCount == null || partyCount > 1) return fields;

  const dropped = new Set(block);
  return fields.filter((f) => !dropped.has(f));
}

const PURCHASER_TOKEN = /\bPurchaser (\d+)\b/g;

// Primary first, then co-purchasers in the order they were added.
async function getPurchaserNames(leadId: string): Promise<string[]> {
  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("id, parent_lead_id")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return [];
  const primaryId = lead.parent_lead_id ?? lead.id;

  const { data: family } = await supabaseAdmin
    .from("leads")
    .select("id, first_name, last_name, parent_lead_id, co_person_role, created_at")
    .or(`id.eq.${primaryId},parent_lead_id.eq.${primaryId}`)
    .order("created_at", { ascending: true });

  return (family ?? [])
    .filter((l) => l.co_person_role !== "seller")
    .sort((a, b) => (a.id === primaryId ? -1 : b.id === primaryId ? 1 : 0))
    .map((l) => `${l.first_name ?? ""} ${l.last_name ?? ""}`.trim());
}

// "Purchaser N" → that purchaser's name.
function withPurchaserNames<T extends { label: string; options: unknown }>(
  fields: T[],
  names: string[]
): T[] {
  const swap = (s: string) =>
    s.replace(PURCHASER_TOKEN, (m, n) => names[Number(n) - 1] || m);
  return fields.map((f) => ({
    ...f,
    label: swap(f.label),
    options: Array.isArray(f.options)
      ? f.options.map((o: { label: string; value: string }) => ({
          ...o,
          label: swap(o.label),
          value: swap(o.value),
        }))
      : f.options,
  }));
}

function mentionsPurchaser(field: { label: string; options: unknown }): boolean {
  const text = field.label + (Array.isArray(field.options) ? JSON.stringify(field.options) : "");
  return new RegExp(PURCHASER_TOKEN.source).test(text);
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
      // "*" so visible_when is picked up once migrated without breaking before.
      .select("*")
      .eq("task_template_id", templateId)
      .order("order_index", { ascending: true });

    if (fieldsError) {
      return NextResponse.json({ success: false, error: fieldsError.message }, { status: 400 });
    }

    console.log(`[task-form-fields] Found ${fields?.length ?? 0} fields for template ${templateId}`);

    let leadId: string | null = null;
    if (task.deal_id) {
      const { data: deal } = await supabaseAdmin
        .from("deals")
        .select("lead_id")
        .eq("id", task.deal_id)
        .single();
      leadId = deal?.lead_id ?? null;
    }

    let formFields = await dropMultiPartyOnlyFields(fields ?? [], leadId);
    if (leadId && formFields.some(mentionsPurchaser)) {
      formFields = withPurchaserNames(formFields, await getPurchaserNames(leadId));
    }

    // 4. Fetch any existing responses so we can pre-fill the form
    const { data: existingResponses } = await supabaseAdmin
      .from("task_responses")
      .select("field_id, field_label, value, file_url, file_name")
      .eq("task_id", task_id);

    // Shared-task sync copies answers by label without field_id; re-link them so they pre-fill.
    const fieldIdByLabel = new Map(
      formFields.map((f) => [f.label.trim().toLowerCase(), f.id])
    );
    const finalResponses = (existingResponses ?? []).map((r) =>
      r.field_id
        ? r
        : { ...r, field_id: fieldIdByLabel.get(r.field_label.trim().toLowerCase()) ?? null }
    );

    // 5. Pre-fill the person's identity (name + email) from their own lead, plus
    // their phone on Personal Information — intake already asked every party for
    // it, so re-typing it is busywork, and the admin panel pre-fills that same
    // field from leads.phone (DealDetail.tsx), so this keeps the two in step.
    //
    // The REST of personal information — street address, city, postal code,
    // marital status, citizenship, occupation, employer phone — must NEVER be
    // pre-filled from the lead. The lead's `address_*` fields are the
    // PROPERTY/transaction address (captured at intake), not the person's home
    // address, and the rest of intake data is not their saved personal info.
    // Those fields autofill ONLY from the `clients` table (handled client-side
    // in the drawer via /api/client-personal-info), so a first-time user with no
    // saved client data correctly starts with blank personal-info fields.
    if (leadId) {
      const { data: lead } = await supabaseAdmin
        .from("leads")
        .select("first_name, last_name, email, phone")
        .eq("id", leadId)
        .single();

      if (lead) {
        const prefillMapping: Record<string, string | null | undefined> = {
          "First Name": lead.first_name,
          "Last Name": lead.last_name,
          "Email": lead.email,
          // Scoped to this task: "Mortgage Representative/Agent Phone Number"
          // and the like are somebody else's number, never the client's.
          ...(isPersonalInfoTask(task.title)
            ? { "Phone Number": lead.phone }
            : {}),
        };

        formFields.forEach((field) => {
          // Skip fields that already have a saved ANSWER. A row whose value
          // is blank (e.g. a field submitted empty) is not one — without this
          // the pre-fill would be skipped for a field that shows as empty.
          const hasAnswer = finalResponses.some(
            r => r.field_id === field.id && String(r.value ?? "").trim() !== ""
          );
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

    return NextResponse.json({
      success: true,
      task,
      fields: formFields,
      existing_responses: finalResponses,
    });
  } catch (err) {
    console.error("GET /api/task-form-fields error:", err);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}

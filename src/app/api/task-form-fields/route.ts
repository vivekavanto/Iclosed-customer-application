import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { isPersonalInfoTask, isHoldTitleField } from "@/lib/taskKinds";
import { getFamilyPartyCount } from "@/lib/familyPartyCount";
import { getFamilyTaskRoster } from "@/lib/familyTaskTargets";

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
  return fields.filter((f) => {
    if (isMultiPartyOnly(f)) return true;
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

type ResponseRow = {
  field_id: string | null;
  field_label: string;
  value: string | null;
  file_url: string | null;
  file_name: string | null;
};

/**
 * How title is held is ONE decision for the whole transaction, so only one party
 * fills it in. Ownership follows whoever actually answered — not who is primary:
 * the party who filled it keeps editing rights, and everyone else sees their
 * answer read-only, ILA warning included (it is aimed at the lower-share party,
 * who is often a co-purchaser).
 *
 * While nobody has answered, the block stays editable for every party — first to
 * save owns it. A draft save counts, so the moment one party fills it the others
 * stop being asked.
 *
 * Returns the fields with `read_only`/`read_only_note` set on that block, plus
 * the owner's answers to merge into the pre-fill. Fails open on anything
 * unresolvable: the block stays editable rather than becoming un-answerable.
 */
async function applyHoldTitleOwnership<
  T extends { id: string; label: string; options: unknown },
>(
  fields: T[],
  taskId: string
): Promise<{ fields: T[]; inherited: ResponseRow[] }> {
  const untouched = { fields, inherited: [] as ResponseRow[] };

  const block = multiPartyOnlyBlock(fields);
  if (block.length === 0) return untouched;

  const roster = await getFamilyTaskRoster(taskId);
  const self = roster?.members.find((m) => m.is_self);
  if (!roster || !self || roster.members.length < 2) return untouched;

  const taskIds = roster.members
    .map((m) => m.task_id)
    .filter((t): t is string => !!t);
  if (taskIds.length === 0) return untouched;

  const { data } = await supabaseAdmin
    .from("task_responses")
    .select("task_id, field_id, field_label, value, file_url, file_name")
    .in("task_id", taskIds);

  // Blank rows don't count as an answer — a submitted-but-empty field leaves one.
  const blockIds = new Set(block.map((f) => f.id));
  const answers = new Map<string, ResponseRow[]>();
  for (const r of data ?? []) {
    if (!r.field_id || !blockIds.has(r.field_id)) continue;
    if (String(r.value ?? "").trim() === "") continue;
    const rows = answers.get(r.task_id) ?? [];
    rows.push({
      field_id: r.field_id,
      field_label: r.field_label,
      value: r.value,
      file_url: r.file_url,
      file_name: r.file_name,
    });
    answers.set(r.task_id, rows);
  }

  // Whoever answered keeps editing rights — never lock a party out of their own
  // answer. Nobody answered yet → everyone may fill it, first save wins.
  if (self.task_id && answers.has(self.task_id)) return untouched;

  const owner = roster.members
    .filter((m) => !m.is_self && m.task_id && answers.has(m.task_id))
    // Deterministic if two parties raced: the primary's copy wins.
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))[0];
  if (!owner) return untouched;

  const ownerName = `${owner.first_name} ${owner.last_name}`.trim();
  const note = `Answered by ${ownerName} (${owner.role_label}) for the whole transaction.`;
  const inBlock = new Set(block);

  return {
    fields: fields.map((f) =>
      inBlock.has(f) ? { ...f, read_only: true, read_only_note: note } : f
    ),
    inherited: answers.get(owner.task_id!) ?? [],
  };
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

    const visibleFields = await dropMultiPartyOnlyFields(fields ?? [], leadId);
    // Whoever answered the hold-title block owns it; others inherit it read-only.
    const { fields: formFields, inherited } =
      await applyHoldTitleOwnership(visibleFields, task_id);

    // 4. Fetch any existing responses so we can pre-fill the form
    const { data: existingResponses } = await supabaseAdmin
      .from("task_responses")
      .select("field_id, field_label, value, file_url, file_name")
      .eq("task_id", task_id);

    let finalResponses = existingResponses ?? [];

    // The primary's answer is the source of truth for the read-only block, so it
    // replaces any stale copy saved on this party's own task.
    if (inherited.length > 0) {
      const inheritedIds = new Set(inherited.map((r) => r.field_id));
      finalResponses = [
        ...finalResponses.filter((r) => !inheritedIds.has(r.field_id)),
        ...inherited,
      ];
    }

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

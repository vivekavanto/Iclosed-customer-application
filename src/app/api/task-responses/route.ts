import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { syncSharedTaskCompletion, syncSharedTaskResponses } from "@/lib/syncSharedTask";
import { triggerMilestoneEmail } from "@/lib/triggerMilestoneEmail";
import { sendCitizenshipFlagEmail } from "@/lib/sendCitizenshipFlagEmail";

// Normalize a citizenship value (possibly legacy or free-text) to the canonical set
// the admin panel expects: canadian_citizen | permanent_resident | visa | refugee_status | non_citizen_unsure.
// Unknown values pass through unchanged so no data is silently dropped.
function normalizeCitizenshipValue(raw: string): string | null {
  const v = (raw || "").trim().toLowerCase();
  if (!v) return null;
  const canonical = [
    "canadian_citizen",
    "permanent_resident",
    "visa",
    "refugee_status",
    "non_citizen_unsure",
  ];
  if (canonical.includes(v)) return v;
  if (v === "citizen") return "canadian_citizen";
  if (v === "granted_refugee_status") return "refugee_status";
  if (v === "non_citizen_&_unsure") return "non_citizen_unsure";
  if (v.includes("non") && (v.includes("citizen") || v.includes("unsure"))) return "non_citizen_unsure";
  if (v.includes("permanent")) return "permanent_resident";
  if (v.includes("refugee")) return "refugee_status";
  if (v.includes("visa")) return "visa";
  if (v.includes("canadian")) return "canadian_citizen";
  return v;
}

/**
 * POST /api/task-responses
 *
 * Saves form responses for a task.
 * Body: {
 *   task_id: string,
 *   responses: Array<{
 *     field_id?: string,
 *     field_label: string,
 *     field_type: string,
 *     value?: string,
 *     file_url?: string,
 *     file_name?: string,
 *   }>
 * }
 *
 * File uploads are handled separately via /api/uploadblobstorage.
 * Only the resulting URL is stored here.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { task_id, responses, draft } = body;

    if (!task_id || !Array.isArray(responses) || responses.length === 0) {
      return NextResponse.json(
        { success: false, error: "task_id and responses[] are required" },
        { status: 400 }
      );
    }

    // Delete any existing responses for this task (full re-submit / overwrite)
    await supabaseAdmin.from("task_responses").delete().eq("task_id", task_id);

    // Insert all responses
    const rows = responses.map((r: any) => ({
      task_id,
      field_id: r.field_id ?? null,
      field_label: r.field_label,
      field_type: r.field_type,
      value: r.value ?? null,
      file_url: r.file_url ?? null,
      file_name: r.file_name ?? null,
    }));

    const { error: insertError } = await supabaseAdmin
      .from("task_responses")
      .insert(rows);

    if (insertError) {
      return NextResponse.json({ success: false, error: insertError.message }, { status: 400 });
    }

    // Fetch task context for shared-task syncing
    const { data: task, error: taskFetchError } = await supabaseAdmin
      .from("tasks")
      .select("id, title, deal_id, milestone_id, is_shared, task_template_id")
      .eq("id", task_id)
      .single();

    // If draft, save responses only — do NOT mark task as completed
    if (draft) {
      // Sync shared task responses to linked deals (co-purchaser) without completing
      if (!taskFetchError && task?.is_shared && task.task_template_id) {
        syncSharedTaskResponses({
          taskId: task.id,
          dealId: task.deal_id,
          taskTemplateId: task.task_template_id,
        }).catch((err) => console.error("[SharedTaskSync] Error:", err));
      }
      return NextResponse.json({ success: true, draft: true });
    }

    // Auto-mark the task as completed on submit
    if (!taskFetchError && task) {
      await supabaseAdmin
        .from("tasks")
        .update({ completed: true, status: "Completed", completed_at: new Date().toISOString() })
        .eq("id", task_id);

      // Sync shared task to linked deals (co-purchaser)
      if (task.is_shared && task.task_template_id) {
        syncSharedTaskCompletion({
          taskId: task.id,
          dealId: task.deal_id,
          taskTemplateId: task.task_template_id,
        }).catch((err) => console.error("[SharedTaskSync] Error:", err));
      }

      // Citizenship flag — alert law clerk if client selected non-citizen / unsure
      console.log(
        "[CitizenshipFlag] all response labels+values:",
        responses.map((r: any) => ({ label: r.field_label, value: r.value })),
      );

      const citizenshipResp = responses.find((r: any) =>
        (r.field_label || "").toLowerCase().includes("citizenship"),
      );

      const rawVal = String(citizenshipResp?.value ?? "").toLowerCase();
      const isFlag =
        rawVal.includes("non") &&
        (rawVal.includes("unsure") || rawVal.includes("citizen"));

      console.log("[CitizenshipFlag] check:", {
        found: !!citizenshipResp,
        label: citizenshipResp?.field_label,
        value: citizenshipResp?.value,
        isFlag,
        deal_id: task.deal_id,
      });

      if (isFlag && task.deal_id) {
        console.log("[CitizenshipFlag] triggering for deal:", task.deal_id);
        sendCitizenshipFlagEmail(task.deal_id, String(citizenshipResp.value)).catch(
          (err) => console.error("[CitizenshipFlag] Trigger failed:", err),
        );
      }

      // Mirror the customer's REUSABLE personal info onto the CUSTOMER record
      // (public.clients) so their NEXT deal can pre-fill these fields and they
      // don't have to re-enter them. citizenship_status also remains the source
      // of truth for the admin non-citizen flag. Resolve the client via
      // deal.client_id, else the lead's client_id/email.
      //
      // Scoped to the Personal Information task only: other tasks (e.g. Mortgage
      // Details) have their own "phone" fields that must NOT overwrite the
      // customer's personal phone on the clients record.
      const isPersonalInfoTask = (task.title ?? "")
        .trim()
        .toLowerCase()
        .includes("personal information");

      if (isPersonalInfoTask && task.deal_id) {
        // Pull the reusable fields out of the submitted responses by matching
        // their labels (keyword-based, tolerant of small label variations).
        const findVal = (pred: (label: string) => boolean): string | null => {
          const r = responses.find((x: any) =>
            pred(String(x.field_label ?? "").toLowerCase()),
          );
          const v = r?.value != null ? String(r.value).trim() : "";
          return v ? v : null;
        };

        const phoneVal = findVal(
          (l) => l.includes("phone") && !l.includes("employer") && !l.includes("business"),
        );
        const maritalVal = findVal((l) => l.includes("marital"));
        const occupationVal = findVal((l) => l.includes("occupation"));
        const employerPhoneVal = findVal(
          (l) => l.includes("employer") || (l.includes("business") && l.includes("phone")),
        );
        const citizenshipRaw = findVal((l) => l.includes("citizenship"));
        const citizenshipVal = citizenshipRaw
          ? normalizeCitizenshipValue(citizenshipRaw)
          : null;

        const clientUpdate: Record<string, string> = {};
        if (phoneVal) clientUpdate.phone = phoneVal;
        if (maritalVal) clientUpdate.marital_status = maritalVal;
        if (occupationVal) clientUpdate.occupation = occupationVal;
        if (employerPhoneVal) clientUpdate.employer_phone = employerPhoneVal;
        if (citizenshipVal) clientUpdate.citizenship_status = citizenshipVal;

        if (Object.keys(clientUpdate).length > 0) {
          const { data: dealRow } = await supabaseAdmin
            .from("deals")
            .select("client_id, lead_id")
            .eq("id", task.deal_id)
            .single();

          // Resolve the client whose record this personal info belongs to. The
          // task's lead is the source of truth for the person — so when the
          // primary submits on a co-purchaser/co-seller's behalf, this resolves
          // the CO-PERSON's own client (not the primary's). Prefer the lead's
          // client_id, then the deal's, then an email match.
          let leadRow:
            | { email: string | null; first_name: string | null; last_name: string | null; client_id: string | null }
            | null = null;
          if (dealRow?.lead_id) {
            const { data } = await supabaseAdmin
              .from("leads")
              .select("email, first_name, last_name, client_id")
              .eq("id", dealRow.lead_id)
              .single();
            leadRow = data ?? null;
          }

          let clientId: string | null =
            leadRow?.client_id ?? dealRow?.client_id ?? null;
          if (!clientId && leadRow?.email) {
            const ep = String(leadRow.email).replace(/[\\%_]/g, "\\$&");
            const { data: c } = await supabaseAdmin
              .from("clients")
              .select("id")
              .ilike("email", ep)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            clientId = c?.id ?? null;
          }

          // A co-purchaser/co-seller is a client too. If they don't have a
          // clients row yet, create one from their lead so their personal info
          // is stored exactly like a primary client's, and link it back to the
          // lead + deal so future lookups resolve directly.
          if (!clientId && leadRow?.email && dealRow?.lead_id) {
            const { data: created, error: createErr } = await supabaseAdmin
              .from("clients")
              .insert({
                email: leadRow.email,
                first_name: leadRow.first_name ?? "",
                last_name: leadRow.last_name ?? "",
              })
              .select("id")
              .single();
            if (createErr) {
              console.error(
                "[PersonalInfoMirror] Failed to create client for co-person:",
                createErr.message,
              );
            } else if (created?.id) {
              clientId = created.id;
              await supabaseAdmin
                .from("leads")
                .update({ client_id: clientId })
                .eq("id", dealRow.lead_id);
              await supabaseAdmin
                .from("deals")
                .update({ client_id: clientId })
                .eq("id", task.deal_id);
            }
          }

          if (clientId) {
            const { error: clientUpdateError } = await supabaseAdmin
              .from("clients")
              .update(clientUpdate)
              .eq("id", clientId);
            if (clientUpdateError) {
              console.error(
                "[PersonalInfoMirror] Failed to mirror to clients:",
                clientUpdateError.message,
              );
            }
          }
        }
      }

      // Check if all tasks in the milestone are now completed
      if (task.milestone_id) {
        const { data: siblings } = await supabaseAdmin
          .from("tasks")
          .select("id, completed")
          .eq("milestone_id", task.milestone_id)
          .eq("is_deleted", false);

        // Re-fetch to get updated state after marking this task done
        const { data: updatedSiblings } = await supabaseAdmin
          .from("tasks")
          .select("id, completed")
          .eq("milestone_id", task.milestone_id)
          .eq("is_deleted", false);

        const allDone =
          (updatedSiblings ?? []).length > 0 &&
          (updatedSiblings ?? []).every((t: any) => t.completed || t.id === task_id);

        if (allDone) {
          await supabaseAdmin
            .from("milestones")
            .update({ status: "Completed", completed_at: new Date().toISOString() })
            .eq("id", task.milestone_id);

          // Trigger milestone email if it has an email_template_id
          triggerMilestoneEmail(task.milestone_id).catch((err) =>
            console.error("[MilestoneEmail] Trigger failed:", err)
          );

          // Advance next milestone to In Progress — stay on the same side for
          // Purchase & Sale deals.
          const { data: currentMs } = await supabaseAdmin
            .from("milestones")
            .select("order_index, side")
            .eq("id", task.milestone_id)
            .single();

          if (currentMs) {
            const nextQ = supabaseAdmin
              .from("milestones")
              .select("id")
              .eq("deal_id", task.deal_id)
              .eq("is_deleted", false)
              .gt("order_index", currentMs.order_index)
              .neq("status", "Completed")
              .order("order_index", { ascending: true })
              .limit(1);
            const { data: nextMs } = currentMs.side === null
              ? await nextQ.is("side", null).maybeSingle()
              : await nextQ.eq("side", currentMs.side).maybeSingle();

            if (nextMs) {
              await supabaseAdmin
                .from("milestones")
                .update({ status: "In Progress" })
                .eq("id", nextMs.id);
            }
          }
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("POST /api/task-responses error:", err);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}

/**
 * GET /api/task-responses?task_id=xxx
 * Returns all saved responses for a task.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const task_id = searchParams.get("task_id");

    if (!task_id) {
      return NextResponse.json({ success: false, error: "task_id is required" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("task_responses")
      .select("*")
      .eq("task_id", task_id)
      .order("submitted_at", { ascending: false });

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, responses: data ?? [] });
  } catch (err) {
    console.error("GET /api/task-responses error:", err);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}

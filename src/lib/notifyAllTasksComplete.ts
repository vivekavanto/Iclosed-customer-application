import supabaseAdmin from "@/lib/supabaseAdmin";
import { sendEmail } from "@/lib/email/emailTransport";
import { interpolateTokens, resolveTemplateSubject } from "@/lib/email-templates/milestone";
import { getLinkedDealIds } from "@/lib/getLinkedDealIds";
import { adminAppUrl } from "@/lib/adminAppUrl";
import { isTaskInactive } from "@/lib/depositTask";
import { isAfterClosingTask, isClosingFiguresTask } from "@/lib/taskKinds";

/**
 * Tell the back office when a client AND their co-party have completed every
 * client-visible task on the file: an email to every active admin, plus a row
 * in the shared `notifications` table that the admin portal's sidebar bell
 * reads.
 *
 * Why this lives here as well as in the admin app: clients finish their tasks
 * HERE. We write `tasks.status = 'Completed'` straight to the shared Supabase DB
 * and run our own `advanceMilestone` — the admin app never sees a client-driven
 * completion. Sending from this side removes the whole cross-app hop (no
 * ADMIN_APP_URL, no shared-secret handshake, no dependency on the admin app
 * being up) for the exact case the alert exists for. The admin keeps its own
 * copy for completions its staff make in the back office.
 *
 * The two implementations CANNOT double-send. The idempotency claim —
 * `deals.all_tasks_notified_at` on the family's primary deal — lives in the
 * shared database and is taken with a conditional UPDATE (NULL -> now()).
 * Whichever app gets there first sends; the other reads a non-NULL value and
 * no-ops. The claim is cleared again whenever the family stops being complete,
 * so re-completing after a task reopens (or after a co-person is added)
 * legitimately re-fires.
 *
 * Scope of "all tasks":
 *   - The whole FAMILY, not one deal — a co-purchaser's outstanding ID upload
 *     must hold the alert back.
 *   - Shared tasks live once on the primary deal, personal tasks one-per-person,
 *     so both are pooled.
 *   - Every non-deleted task, which is exactly the set we serve the client in
 *     /api/tasks. There is a `hidden_from_client` flag in the admin repo's
 *     2026-06-04 migration, but it was never applied and nothing reads it —
 *     including us. Filtering on it would ignore tasks still on the client's
 *     screen and fire this alert early, so we deliberately don't.
 *
 * Best-effort by contract: never throws, so it can't fail a task submission.
 */

const TEMPLATE_NAME = "All Tasks Completed";
const NOTIFICATION_TYPE = "deal.all_tasks_complete";

/** Admin portal base, used for the "Review file" link in the email. */
function adminBaseUrl(): string {
  return adminAppUrl();
}

/** deal -> lead -> root lead (parent_lead_id or self) -> that lead's deal. */
async function resolvePrimaryDealId(dealId: string): Promise<string> {
  try {
    const { data: deal } = await supabaseAdmin
      .from("deals")
      .select("lead_id")
      .eq("id", dealId)
      .single();
    if (!deal?.lead_id) return dealId;

    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("id, parent_lead_id")
      .eq("id", deal.lead_id)
      .single();

    const rootLeadId = lead?.parent_lead_id ?? lead?.id;
    if (!rootLeadId) return dealId;

    const { data: rootDeal } = await supabaseAdmin
      .from("deals")
      .select("id")
      .eq("lead_id", rootLeadId)
      .maybeSingle();
    return rootDeal?.id ?? dealId;
  } catch {
    return dealId;
  }
}

/**
 * `deals.closing_date` is a DATE. `new Date("2026-03-14")` is UTC midnight,
 * which renders as the PREVIOUS day in any negative-offset timezone — so format
 * the Y/M/D parts explicitly in UTC.
 */
function formatClosingDate(raw: string | null | undefined): string {
  if (!raw) return "TBD";
  const m = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(raw);
  const [, y, mo, d] = m;
  return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d))).toLocaleDateString(
    "en-CA",
    { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" },
  );
}

function joinParts(parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(", ");
}

function fullName(row: { first_name?: string | null; last_name?: string | null }): string {
  return [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
}

/** "Jane Doe", "Jane Doe and John Doe", "Jane Doe, John Doe and Amy Doe". */
function joinNames(names: string[]): string {
  const clean = names.filter(Boolean);
  if (clean.length === 0) return "";
  if (clean.length === 1) return clean[0];
  return `${clean.slice(0, -1).join(", ")} and ${clean[clean.length - 1]}`;
}

/** Values are client-supplied, so they may only ever render as text. */
function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatLeadTypeLabel(raw: string | null | undefined): string {
  const lt = (raw ?? "").toLowerCase().trim();
  if (lt.includes("purchase") && lt.includes("sale")) return "Purchase & Sale";
  if (lt === "sale" || (lt.includes("sale") && !lt.includes("purchase"))) return "Sale";
  if (lt === "purchase") return "Purchase";
  if (lt === "refinance") return "Refinance";
  return (raw ?? "").trim();
}

/**
 * Who gets the alert email.
 *
 * Defaults to the firm's alert inbox rather than fanning out to every admin —
 * one place to watch, and no risk of blasting the whole team while the feature
 * is being tuned. Override with ALL_TASKS_ALERT_TO:
 *
 *   ALL_TASKS_ALERT_TO="ops@example.com,clerk@example.com"  → those addresses
 *   ALL_TASKS_ALERT_TO="admins"                             → every active
 *                                                             admin_users row
 *
 * Kept in step with the admin repo's copy in src/lib/notifyAllTasksComplete.ts,
 * which now handles the normal path (see requestAllTasksCompleteAlert.ts) — this
 * default only governs the fallback, and the two diverging is what previously
 * sent client-completion alerts to a different inbox than staff-completion ones.
 *
 * The in-app notification is unaffected either way — it's a broadcast row, so
 * every admin still sees it in the sidebar bell regardless of who is emailed.
 */
const DEFAULT_ALERT_TO = "aliya@navawilson.law";

async function resolveRecipients(): Promise<string[]> {
  const configured = (process.env.ALL_TASKS_ALERT_TO ?? DEFAULT_ALERT_TO).trim();

  if (configured.toLowerCase() === "admins") {
    const { data: admins } = await supabaseAdmin
      .from("admin_users")
      .select("email")
      .eq("is_active", true);
    return Array.from(
      new Set((admins ?? []).map((a) => (a.email ?? "").trim()).filter(Boolean)),
    );
  }

  return Array.from(
    new Set(
      configured
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  );
}

async function releaseClaim(primaryDealId: string): Promise<void> {
  await supabaseAdmin
    .from("deals")
    .update({ all_tasks_notified_at: null })
    .eq("id", primaryDealId)
    .not("all_tasks_notified_at", "is", null);
}

export async function notifyAllTasksComplete(
  dealId: string | null | undefined,
): Promise<void> {
  if (!dealId) return;

  try {
    const primaryDealId = await resolvePrimaryDealId(dealId);
    const linked = await getLinkedDealIds(dealId).catch(() => [] as string[]);
    const familyDealIds = Array.from(new Set([dealId, primaryDealId, ...linked]));

    // Shared tasks are a single source of truth on the primary deal; personal
    // tasks exist per person. Pool both.
    const [{ data: sharedTasks }, { data: personalTasks }] = await Promise.all([
      supabaseAdmin
        .from("tasks")
        .select("id, title, status, activation_required, activated_at")
        .eq("deal_id", primaryDealId)
        .eq("is_shared", true)
        .eq("is_deleted", false),
      supabaseAdmin
        .from("tasks")
        .select("id, title, status, activation_required, activated_at")
        .in("deal_id", familyDealIds)
        .or("is_shared.is.null,is_shared.eq.false")
        .eq("is_deleted", false),
    ]);

    // Tasks awaiting an admin's activation are dropped, not counted as
    // outstanding: they are not on the client's dashboard at all (the
    // closing-funds task is created switched off until the firm has drawn up the
    // Final Statement of Account). Mirrors the admin repo — see its
    // 2026-08-26 migration and src/lib/depositTask.ts.
    // Closing-figures and after-closing tasks come later.
    const pooled = [...(sharedTasks ?? []), ...(personalTasks ?? [])].filter(
      (t) =>
        !isTaskInactive(t) && !isClosingFiguresTask(t.title) && !isAfterClosingTask(t.title),
    );

    // A file with no client-visible tasks hasn't "completed" anything.
    if (pooled.length === 0) {
      await releaseClaim(primaryDealId);
      return;
    }

    if (!pooled.every((t) => t.status === "Completed")) {
      // Something is still outstanding somewhere in the family — drop any stale
      // claim so the alert can fire once everyone finishes.
      await releaseClaim(primaryDealId);
      return;
    }

    // Claim before doing any work. Shared with the admin app, so this is also
    // what stops the two implementations from both sending.
    const { data: claimed, error: claimErr } = await supabaseAdmin
      .from("deals")
      .update({ all_tasks_notified_at: new Date().toISOString() })
      .eq("id", primaryDealId)
      .is("all_tasks_notified_at", null)
      .select("id");

    if (claimErr) {
      console.error("[AllTasksComplete] failed to claim alert:", claimErr.message);
      return;
    }
    if (!claimed || claimed.length === 0) return; // already alerted

    await dispatchAlert(primaryDealId, familyDealIds, pooled.length);
  } catch (err) {
    console.error("[AllTasksComplete] unexpected failure:", err);
  }
}

async function dispatchAlert(
  primaryDealId: string,
  familyDealIds: string[],
  taskCount: number,
): Promise<void> {
  const { data: deal } = await supabaseAdmin
    .from("deals")
    .select("id, lead_id, file_number, type, closing_date, property_address, selling_property_address")
    .eq("id", primaryDealId)
    .maybeSingle();

  if (!deal) return;

  const { data: primaryLead } = deal.lead_id
    ? await supabaseAdmin.from("leads").select("*").eq("id", deal.lead_id).maybeSingle()
    : { data: null };

  const rootLeadId = primaryLead?.parent_lead_id ?? primaryLead?.id ?? null;
  const { data: familyLeads } = rootLeadId
    ? await supabaseAdmin
        .from("leads")
        .select("id, first_name, last_name")
        .or(`id.eq.${rootLeadId},parent_lead_id.eq.${rootLeadId}`)
        .eq("is_deleted", false)
    : { data: null };

  const clientName = primaryLead ? fullName(primaryLead) : "";
  const coPartyNames = (familyLeads ?? [])
    .filter((l) => l.id !== primaryLead?.id)
    .map(fullName)
    .filter(Boolean);
  const partySummary = joinNames([clientName, ...coPartyNames]) || clientName || "Client";

  const leadTypeLabel = formatLeadTypeLabel(primaryLead?.lead_type ?? deal.type);
  const purchase = joinParts([
    primaryLead?.address_street,
    primaryLead?.address_city,
    primaryLead?.address_province,
    primaryLead?.address_postal_code,
  ]) || deal.property_address || "";
  const selling = joinParts([
    primaryLead?.selling_address_street,
    primaryLead?.selling_address_city,
    primaryLead?.selling_address_province,
    primaryLead?.selling_address_postal_code,
  ]) || deal.selling_property_address || "";

  const isCombined = leadTypeLabel === "Purchase & Sale" || (!!purchase && !!selling);
  const isSaleOnly = !isCombined && leadTypeLabel === "Sale";

  // Pairs each address with its own side, so a combined file doesn't collapse
  // into "Purchase & Sale of X and Y". Mirrors renderTransactionPhrase in the
  // admin repo.
  const propertyAddress = [purchase, selling].filter(Boolean).join(" and ");
  // Street line only — "2615 Ellesmere Road", not the full
  // "2615 Ellesmere Road, Toronto, ON, M1H 2S6", for subject lines that get
  // truncated in an inbox list. joinParts glues street, city, province and
  // postal with ", ", so the first segment is the street. Mirrors
  // propertyStreet in the admin repo's notifyAllTasksComplete.ts — either app
  // may be the one that renders this template.
  const streetOf = (joined: string) => (joined.split(",")[0] ?? "").trim();
  const propertyStreet = [streetOf(purchase), streetOf(selling)]
    .filter(Boolean)
    .join(" and ");
  let transaction = "";
  if (isCombined && purchase && selling) {
    transaction = `Purchase of ${purchase} and Sale of ${selling}`;
  } else if (isSaleOnly) {
    transaction = selling || purchase ? `Sale of ${selling || purchase}` : "";
  } else {
    const addr = purchase || selling;
    if (addr) transaction = leadTypeLabel ? `${leadTypeLabel} of ${addr}` : addr;
  }

  const closingDate = formatClosingDate(deal.closing_date);
  const fileNumber = deal.file_number ?? "";
  const dealUrl = `${adminBaseUrl()}/admin/deals/${deal.id}`;

  const title = `All tasks completed — ${partySummary}`;
  const body =
    `${partySummary}${transaction ? ` (${transaction})` : ""} ` +
    `has completed all ${taskCount} task${taskCount === 1 ? "" : "s"} on iClosed. ` +
    `Closing date: ${closingDate}.`;

  // 1. In-app notification for the admin portal's bell. Written FIRST so the
  //    alert survives even if Resend is down or no template is configured.
  const { error: notifErr } = await supabaseAdmin.from("notifications").insert({
    type: NOTIFICATION_TYPE,
    title,
    body,
    deal_id: deal.id,
    lead_id: deal.lead_id ?? null,
    file_number: fileNumber || null,
    metadata: {
      client_name: clientName,
      co_party_names: coPartyNames,
      transaction,
      property_address: propertyAddress,
      closing_date: closingDate,
      lead_type: leadTypeLabel,
      task_count: taskCount,
      family_deal_ids: familyDealIds,
      source: "portal",
    },
  });
  if (notifErr) {
    console.error("[AllTasksComplete] failed to write in-app notification:", notifErr.message);
  }

  // 2. Email the alert inbox.
  const recipients = await resolveRecipients();
  if (recipients.length === 0) {
    console.warn("[AllTasksComplete] no alert recipients resolved — in-app only");
    return;
  }

  const { data: template } = await supabaseAdmin
    .from("email_templates")
    .select("name, subject, body")
    .ilike("name", `%${TEMPLATE_NAME}%`)
    .eq("is_active", true)
    .or("is_deleted.eq.false,is_deleted.is.null")
    .maybeSingle();

  if (!template?.body) {
    // Marking the template inactive is a real off-switch for the email; the
    // in-app notification still lands.
    console.warn(
      `[AllTasksComplete] no active "${TEMPLATE_NAME}" template — in-app only. Run the admin migration that seeds it.`,
    );
    return;
  }

  // Every value except the system-generated link is client-supplied, so escape
  // it — interpolateTokens splices values in verbatim.
  const variables: Record<string, string> = {
    client_name: escapeHtml(clientName),
    co_party_names: escapeHtml(coPartyNames.join(", ")),
    party_summary: escapeHtml(partySummary),
    transaction: escapeHtml(transaction),
    property_address: escapeHtml(propertyAddress),
    property_street: escapeHtml(propertyStreet),
    closing_date: escapeHtml(closingDate),
    file_number: escapeHtml(fileNumber),
    lead_type: escapeHtml(leadTypeLabel),
    task_count: String(taskCount),
    deal_url: dealUrl,
  };

  const html = interpolateTokens(template.body, variables);
  const subject = resolveTemplateSubject(
    template,
    { ...variables, client_name: clientName, file_number: fileNumber },
    `All tasks completed — ${partySummary}`,
  );

  // Internal staff alert: firm-agnostic by design, so `firm: null` also pins it
  // to Resend whatever the SMTP rollout does.
  const result = await sendEmail(
    { to: recipients, subject, html },
    { firm: null, label: "all-tasks-complete" },
  );

  if (!result.ok) {
    // Deliberately NOT releasing the claim: the in-app notification is already
    // written, and releasing would duplicate it on the next task edit.
    console.error(
      `[AllTasksComplete] send failed (in-app notification was still created):`,
      result.error,
    );
    return;
  }

  console.log(
    `[AllTasksComplete] alerted ${recipients.length} admin(s) — deal=${deal.id} file=${fileNumber}`,
  );
}

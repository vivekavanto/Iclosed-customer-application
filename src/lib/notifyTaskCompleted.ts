import supabaseAdmin from "@/lib/supabaseAdmin";
import { resend, EMAIL_FROM, EMAIL_REPLY_TO } from "@/lib/resend";
import { interpolateTokens, resolveTemplateSubject } from "@/lib/email-templates/milestone";
import { getAuthUser } from "@/lib/getAuthClient";
import { adminAppUrl } from "@/lib/adminAppUrl";

/**
 * Tell the back office the moment a CLIENT finishes a single task: an email to
 * the alert inbox plus a row in the shared `notifications` table that the admin
 * portal's sidebar bell reads.
 *
 * Why: clients finish tasks whenever they get round to it — the home-insurance
 * policy lands a week after sign-up — and nothing told the office it had
 * arrived, so someone had to open the file every day to check. This closes that
 * gap per task; notifyAllTasksComplete still fires separately when the WHOLE
 * family is finished (so the last task of a file legitimately produces both:
 * "X completed Y" and "everything is done").
 *
 * CLIENT actions only. Two things keep admin work out of it:
 *   • Placement. Admins complete tasks in the admin app, which writes to the
 *     shared database directly and never calls this portal's API. Every call
 *     site here is a client-facing route.
 *   • A guard. If the request carries a session belonging to an `admin_users`
 *     row, we skip — so an admin driving the portal on a client's behalf can't
 *     generate a false "your client completed X".
 *
 * Fires once per completion, not once per save: callers pass `wasCompleted` so
 * a client re-opening a finished task and re-submitting is silent. It does fire
 * again if a task is genuinely reopened and re-done.
 *
 * The wording comes from the "Client Task Completed" row in `email_templates`,
 * editable in the admin app. If that row is missing or inactive the built-in
 * copy below is used instead — this alert exists precisely so nobody has to
 * watch a file by hand, so it must not go quiet on a template mistake. Use
 * TASK_COMPLETED_ALERT_TO=off to actually turn the email off.
 *
 * Best-effort by contract: never throws, so it can't fail a task submission.
 */

const NOTIFICATION_TYPE = "task.client_completed";

/**
 * Row in `email_templates` that owns the wording. Matched with ILIKE, and
 * deliberately NOT "%Task Completed%" — that would also match a future "All
 * Tasks Completed"-style name.
 */
const TEMPLATE_NAME = "Client Task Completed";

/**
 * Who gets the alert. Override with TASK_COMPLETED_ALERT_TO (comma-separated);
 * set it to "off" to silence the email — the in-app notification still lands,
 * so the admin bell keeps working.
 */
const DEFAULT_ALERT_TO = "iclosed@navawilson.ca";

function resolveRecipients(): string[] {
  const configured = (process.env.TASK_COMPLETED_ALERT_TO ?? DEFAULT_ALERT_TO).trim();
  if (!configured || configured.toLowerCase() === "off") return [];
  return Array.from(
    new Set(
      configured
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  );
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

function joinParts(parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(", ");
}

function fullName(row: { first_name?: string | null; last_name?: string | null }): string {
  return [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
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

/** True when the caller's session belongs to a member of staff, not a client. */
async function isAdminSession(): Promise<{ isAdmin: boolean; email: string | null }> {
  try {
    const user = await getAuthUser();
    const email = user?.email?.trim() ?? null;
    if (!email) return { isAdmin: false, email: null };

    const { data: adminRow } = await supabaseAdmin
      .from("admin_users")
      .select("id")
      .ilike("email", email)
      .maybeSingle();

    return { isAdmin: !!adminRow, email };
  } catch {
    // No session (or no cookie context) is the normal client case — never let
    // this decide anything but "not a known admin".
    return { isAdmin: false, email: null };
  }
}

/**
 * Wording used only until the "Client Task Completed" template exists in the
 * admin app. Identical markup and tokens to the seed template, so swapping to
 * the DB row changes nothing until someone edits it there.
 *
 * Takes ALREADY-ESCAPED values, exactly like the template path does.
 */
function builtInHtml(v: Record<string, string>): string {
  const row = (label: string, value: string) => `
      <tr>
        <td style="padding: 6px 16px 6px 0; color:#555; white-space:nowrap; vertical-align:top;"><strong>${label}</strong></td>
        <td style="padding: 6px 0; vertical-align:top;">${value || "—"}</td>
      </tr>`;

  return `
      <div style="font-family: Arial, sans-serif; color: #111; line-height: 1.5;">
        <h2 style="margin: 0 0 16px; font-size: 18px;">Task Completed</h2>
        <p style="margin: 0 0 16px;">
          Your client <strong>${v.client_name}</strong> completed
          <strong>${v.task_title}</strong> on iClosed.
        </p>
        <table style="border-collapse: collapse; width: 100%; max-width: 560px;">
          ${row("Client", v.client_name)}
          ${row("Client email", v.client_email)}
          ${row("Task", v.task_title)}
          ${row("Side", v.side)}
          ${row("Submitted by", v.submitted_by)}
          ${row("File number", v.file_number)}
          ${row("Property", v.property_address)}
          ${row("Closing date", v.closing_date)}
          ${row("Completed at", v.completed_at)}
        </table>
        <p style="margin: 20px 0 0;">
          <a href="${v.deal_url}" style="color:#1a4fd6;">Open the file in iClosed</a>
        </p>
      </div>`;
}

export interface ClientTaskCompletedParams {
  /** The task the client just finished. */
  taskId: string;
  /** Deal the task hangs off — the party whose task it is. */
  dealId: string | null | undefined;
  /** Task title, when the caller already has it (saves a query). */
  taskTitle?: string | null;
  /**
   * Whether the task was ALREADY complete before this request. Re-submitting a
   * finished task is a no-op for the office, so it stays quiet.
   */
  wasCompleted?: boolean;
  /** Call site, for log lines only. */
  source: string;
}

export async function notifyClientTaskCompleted(
  params: ClientTaskCompletedParams,
): Promise<void> {
  const { taskId, dealId, source, wasCompleted = false } = params;
  if (!dealId || !taskId || wasCompleted) return;

  try {
    const { isAdmin, email: actorEmail } = await isAdminSession();
    if (isAdmin) {
      console.log(
        `[TaskCompleted] skipped — admin session (${actorEmail}) completed task ${taskId}`,
      );
      return;
    }

    let taskTitle = (params.taskTitle ?? "").trim();
    let side: string | null = null;
    {
      const { data: task } = await supabaseAdmin
        .from("tasks")
        .select("title, side")
        .eq("id", taskId)
        .maybeSingle();
      if (!taskTitle) taskTitle = (task?.title ?? "").trim();
      side = task?.side ?? null;
    }
    if (!taskTitle) taskTitle = "a task";

    const { data: deal } = await supabaseAdmin
      .from("deals")
      .select("id, lead_id, file_number, type, closing_date, property_address, selling_property_address")
      .eq("id", dealId)
      .maybeSingle();

    if (!deal) return;

    const { data: lead } = deal.lead_id
      ? await supabaseAdmin
          .from("leads")
          .select(
            "id, first_name, last_name, email, phone, lead_type, address_street, address_unit, address_city, address_province, address_postal_code, selling_address_street, selling_address_city, selling_address_province, selling_address_postal_code",
          )
          .eq("id", deal.lead_id)
          .maybeSingle()
      : { data: null };

    const clientName = lead ? fullName(lead) : "";
    const displayName = clientName || "A client";

    const purchase =
      joinParts([
        lead?.address_street,
        lead?.address_unit,
        lead?.address_city,
        lead?.address_province,
        lead?.address_postal_code,
      ]) || deal.property_address || "";
    const selling =
      joinParts([
        lead?.selling_address_street,
        lead?.selling_address_city,
        lead?.selling_address_province,
        lead?.selling_address_postal_code,
      ]) || deal.selling_property_address || "";

    // On a Purchase & Sale file the same title exists on both sides, so the
    // side decides which address this task is actually about.
    const sideKey = (side ?? "").toLowerCase();
    const propertyAddress =
      sideKey === "sale"
        ? selling || purchase
        : sideKey === "purchase"
          ? purchase || selling
          : [purchase, selling].filter(Boolean).join(" and ");

    const sideLabel =
      sideKey === "sale" ? "Sale" : sideKey === "purchase" ? "Purchase" : "";
    const fileNumber = deal.file_number ?? "";
    const closingDate = formatClosingDate(deal.closing_date);
    const dealUrl = `${adminAppUrl()}/admin/deals/${deal.id}`;

    // The signed-in client is normally the person the task belongs to, but a
    // primary can submit for a co-purchaser/co-seller. Name them both when they
    // differ so the office knows who actually did the work.
    const leadEmail = (lead?.email ?? "").trim();
    const submittedByOther =
      actorEmail && leadEmail && actorEmail.toLowerCase() !== leadEmail.toLowerCase()
        ? actorEmail
        : "";

    const title = `${displayName} completed "${taskTitle}"`;
    const body =
      `${displayName} completed "${taskTitle}"${sideLabel ? ` (${sideLabel} side)` : ""} on iClosed` +
      `${propertyAddress ? ` — ${propertyAddress}` : ""}.` +
      `${submittedByOther ? ` Submitted by ${submittedByOther}.` : ""}`;

    // 1. In-app notification for the admin portal's bell. Written FIRST so the
    //    alert survives even if Resend is down.
    const { error: notifErr } = await supabaseAdmin.from("notifications").insert({
      type: NOTIFICATION_TYPE,
      title,
      body,
      deal_id: deal.id,
      lead_id: deal.lead_id ?? null,
      file_number: fileNumber || null,
      metadata: {
        task_id: taskId,
        task_title: taskTitle,
        side: side ?? null,
        client_name: clientName,
        client_email: leadEmail,
        submitted_by: submittedByOther || leadEmail,
        property_address: propertyAddress,
        closing_date: closingDate,
        source: `portal:${source}`,
      },
    });
    if (notifErr) {
      console.error("[TaskCompleted] failed to write in-app notification:", notifErr.message);
    }

    // 2. Email the alert inbox.
    const recipients = resolveRecipients();
    if (recipients.length === 0) return; // in-app only, by configuration

    // Wording lives in the admin app's Email Templates, so the office can edit
    // it without a deploy. Every value except the system-generated link is
    // client-supplied, so escape it — interpolateTokens splices values in
    // verbatim.
    const variables: Record<string, string> = {
      client_name: escapeHtml(displayName),
      client_email: escapeHtml(leadEmail || "—"),
      task_title: escapeHtml(taskTitle),
      side: escapeHtml(sideLabel || "—"),
      submitted_by: escapeHtml(submittedByOther || leadEmail || "—"),
      file_number: escapeHtml(fileNumber || "—"),
      property_address: escapeHtml(propertyAddress || "—"),
      closing_date: escapeHtml(closingDate),
      completed_at: escapeHtml(new Date().toLocaleString("en-CA")),
      deal_url: dealUrl,
    };

    const { data: template } = await supabaseAdmin
      .from("email_templates")
      .select("name, subject, body")
      .ilike("name", `%${TEMPLATE_NAME}%`)
      .eq("is_active", true)
      .or("is_deleted.eq.false,is_deleted.is.null")
      .limit(1)
      .maybeSingle();

    const fallbackSubject = `${displayName} completed "${taskTitle}"${fileNumber ? ` — file ${fileNumber}` : ""}`;

    if (!template?.body) {
      // Unlike the other template-backed emails, a missing template does NOT
      // silence this one — the whole point is that nobody has to watch for a
      // task landing. Fall back to the built-in wording and say so in the logs.
      // The real off-switch is TASK_COMPLETED_ALERT_TO=off.
      console.warn(
        `[TaskCompleted] no active "${TEMPLATE_NAME}" template — using built-in wording. Add it under Email Templates in the admin app.`,
      );
    }

    const html = template?.body
      ? interpolateTokens(template.body, variables)
      : builtInHtml(variables);

    // Only the template's own Subject field, never its name: "Client Task
    // Completed" as a subject line hides the one thing the office needs to see
    // at a glance — who did what.
    const subject = resolveTemplateSubject(
      { subject: template?.subject ?? null, name: null },
      { ...variables, client_name: displayName, task_title: taskTitle, file_number: fileNumber },
      fallbackSubject,
    );

    const { error } = await resend.emails.send({
      from: EMAIL_FROM,
      replyTo: EMAIL_REPLY_TO,
      to: recipients,
      subject,
      html,
    });

    if (error) {
      console.error("[TaskCompleted] Resend error (in-app notification was still created):", error);
      return;
    }

    console.log(
      `[TaskCompleted] alerted ${recipients.length} recipient(s) — task=${taskId} deal=${deal.id} source=${source}`,
    );
  } catch (err) {
    console.error("[TaskCompleted] unexpected failure:", err);
  }
}

import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { computeStatement, type ClosingCostInputs } from "@/lib/closingCosts";
import {
  parseClientMortgage,
  parseFileId,
  rejectLockedInputs,
  resolveClientEstimateContext,
} from "@/lib/clientEstimateContext";

// POST /api/closing-estimate/save
//
// Puts the client's OWN closing-cost calculation in front of the back office.
//
// The office wants to see the numbers the client worked out for themselves —
// what mortgage they are planning around and what closing costs they are
// expecting — so this mirrors the live calculator onto the client's file as a
// completed, admin-only task with one response row per statement line. The
// admin panel already renders task responses generically, so nothing changes
// over there.
//
// ── The boundary this does NOT cross ────────────────────────────────────
// Nothing here is written to `deal_closing_estimates`. That table is the firm's
// record of what IT quoted, and a client's planning figures must never be
// mistaken for a staff-prepared statement. The task title and the leading note
// row both say whose numbers these are.
//
// Only the mortgage amount and the first-time-buyer flag come from the request.
// Everything else — the price, the deposit, the property, the firm and its fee
// schedule — is resolved from the client's own file, so what the office reads
// here can never be a figure the client simply asserted.

export const dynamic = "force-dynamic";

/**
 * The title the task is found and re-found by. Changing it orphans the tasks
 * already out there, which would show the office two copies.
 */
const TASK_TITLE = "Closing cost estimate — client's own figures";

/** "$21,363.69" */
function money(n: number): string {
  const neg = n < 0;
  const abs = Math.abs(n)
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}$${abs}`;
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request" },
      { status: 400 },
    );
  }

  const locked = rejectLockedInputs(body);
  if (locked) {
    return NextResponse.json({ success: false, error: locked }, { status: 400 });
  }

  // Which of the client's own files this is about. Checked against the session's
  // deals by the resolver, so an id that is not theirs is a 404.
  const fileId = parseFileId(body.file_id);
  if (fileId !== null && typeof fileId !== "string") {
    return NextResponse.json(
      { success: false, error: fileId.error },
      { status: 404 },
    );
  }

  const resolved = await resolveClientEstimateContext(fileId);
  if (!resolved.ok) {
    return NextResponse.json(
      { success: false, error: resolved.error },
      { status: resolved.status },
    );
  }
  const ctx = resolved.context;

  const mortgage = parseClientMortgage(body.mortgage_amount);
  if (typeof mortgage !== "number") {
    return NextResponse.json(
      { success: false, error: mortgage.error },
      { status: 400 },
    );
  }

  // Nothing worth showing the office until the file carries a price to plan
  // around.
  if (ctx.locked.price <= 0) {
    return NextResponse.json({ success: true, saved: false, reason: "no_price" });
  }

  // A client with no file yet has nowhere for this to hang. The calculator
  // still works — it just isn't mirrored anywhere.
  if (!ctx.deal) {
    return NextResponse.json({ success: true, saved: false, reason: "no_deal" });
  }
  const deal = ctx.deal;

  const inputs: ClosingCostInputs = {
    price: ctx.locked.price,
    deposit: ctx.locked.deposit,
    mortgage,
    isToronto: ctx.locked.isToronto,
    isFirstTimeBuyer: body.is_first_time_buyer === true,
    titlePremiumOverride: ctx.locked.titlePremiumOverride,
    propertyTaxAdjustment: ctx.locked.propertyTaxAdjustment,
    // null → undefined: the firm never said, so each line keeps its default.
    titlePremiumIsEstimate: ctx.locked.titlePremiumIsEstimate ?? undefined,
    teraviewIsEstimate: ctx.locked.teraviewIsEstimate ?? undefined,
    sheriffIsEstimate: ctx.locked.sheriffIsEstimate ?? undefined,
    propertyTaxIsEstimate: ctx.locked.propertyTaxIsEstimate ?? undefined,
  };
  const statement = computeStatement(inputs, ctx.rates);

  // ── Find or create the file's single estimate task ──
  //
  // `role_type: "admin"` is what keeps this off the client's own dashboard —
  // GET /api/tasks drops admin-role rows. `milestone_id` and
  // `task_template_id` stay null deliberately: a template-less, milestone-less
  // task is invisible to the milestone rollup and to the admin app's
  // template-reconciliation cascade, both of which key off task_template_id.
  // It is born Completed because there is nothing here for anyone to do.
  //
  // Read as a LIST, not maybeSingle: two tabs calculating at once can each find
  // nothing and each insert. Taking the oldest and retiring the rest heals that
  // on the next save instead of leaving the office looking at two copies.
  const { data: existingRows } = await supabaseAdmin
    .from("tasks")
    .select("id")
    .eq("deal_id", deal.id)
    .eq("title", TASK_TITLE)
    .eq("is_deleted", false)
    .order("created_at", { ascending: true });

  const now = new Date().toISOString();
  let taskId = existingRows?.[0]?.id ?? null;

  const duplicateIds = (existingRows ?? []).slice(1).map((t) => t.id);
  if (duplicateIds.length > 0) {
    await supabaseAdmin
      .from("tasks")
      .update({ is_deleted: true })
      .in("id", duplicateIds);
  }

  if (taskId) {
    await supabaseAdmin
      .from("tasks")
      .update({ completed: true, status: "Completed", completed_at: now })
      .eq("id", taskId);
  } else {
    const { data: created, error: createError } = await supabaseAdmin
      .from("tasks")
      .insert({
        deal_id: deal.id,
        title: TASK_TITLE,
        status: "Completed",
        completed: true,
        completed_at: now,
        role_type: "admin",
        is_shared: false,
        milestone_id: null,
        task_template_id: null,
      })
      .select("id")
      .single();

    if (createError || !created) {
      console.error(
        "[closing-estimate save] task insert failed:",
        createError?.message,
      );
      return NextResponse.json(
        { success: false, error: "Could not save your estimate" },
        { status: 500 },
      );
    }
    taskId = created.id;
  }

  // ── The statement, as response rows ──
  //
  // Inserted as ONE batch in reading order: the admin panel renders responses
  // in the order the query returns them, which for a single batch is the order
  // they were written.
  const row = (label: string, value: string) => ({
    task_id: taskId,
    field_id: null,
    field_label: label,
    field_type: "text",
    value,
    file_url: null,
    file_name: null,
  });

  const rows = [
    row(
      "About these figures",
      "Entered by the client in the portal's closing-cost calculator. A planning estimate — not a statement of account.",
    ),
    row("Purchase price", money(inputs.price)),
    row("Deposit already paid", money(inputs.deposit)),
    row("Mortgage amount", mortgage > 0 ? money(mortgage) : "None — cash deal"),
    row(
      "Where is the property?",
      inputs.isToronto ? "City of Toronto" : "Elsewhere in Ontario",
    ),
    row("First-time home buyer", inputs.isFirstTimeBuyer ? "Yes" : "No"),
    ...statement.groups.flatMap((g) =>
      g.lines.map((l) => row(l.label, money(l.amount))),
    ),
    row(statement.hst.label, money(statement.hst.amount)),
    ...(statement.propertyTax
      ? [row(statement.propertyTax.label, money(statement.propertyTax.amount))]
      : []),
    row("Total closing costs", money(statement.total)),
    row(
      "Estimated balance due on closing",
      money(statement.balance.balanceDue),
    ),
    row("Calculated on", now.slice(0, 10)),
  ];

  // Full overwrite — the office sees the client's current numbers, not a merge
  // of this attempt and the last one.
  await supabaseAdmin.from("task_responses").delete().eq("task_id", taskId);

  const { error: insertError } = await supabaseAdmin
    .from("task_responses")
    .insert(rows);

  if (insertError) {
    console.error(
      "[closing-estimate save] responses insert failed:",
      insertError.message,
    );
    return NextResponse.json(
      { success: false, error: "Could not save your estimate" },
      { status: 500 },
    );
  }

  // Deliberately NO admin email here. Unlike a task the client submits once,
  // this rewrites itself as they explore, so notifying would be a stream of
  // near-identical alerts. The figures are simply there when staff open the file.

  return NextResponse.json({ success: true, saved: true, task_id: taskId });
}

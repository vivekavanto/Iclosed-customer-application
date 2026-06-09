import supabaseAdmin from "@/lib/supabaseAdmin";
import { getAuthClientDeal } from "@/lib/getAuthClient";
import { getLinkedDealIds } from "@/lib/getLinkedDealIds";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Map deal type to task_template lead_type
function getTaskTemplateType(dealType: string): string {
  switch (dealType) {
    case "Purchase & Sale":
      return "Purchase";
    case "Sale":
      return "Sale";
    case "Refinance":
      return "Refinance";
    default:
      return "Purchase";
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const lead_id = searchParams.get("lead_id");
    const deal_id = searchParams.get("deal_id");

    const authData = await getAuthClientDeal();

    let dealIds: string[] = [];

    // ─────────────────────────────────────────
    // 1️⃣ AUTHENTICATED CLIENT
    // client_id → get ALL deals
    // ─────────────────────────────────────────
    if (authData?.client) {
      const { data: deals } = await supabaseAdmin
        .from("deals")
        .select("id")
        .eq("client_id", authData.client.id)
        .eq("is_deleted", false);

      dealIds = (deals ?? []).map((d: any) => d.id);
    }

    // ─────────────────────────────────────────
    // 2️⃣ LEAD LOGIN FLOW
    // lead_id → client_id → deals
    // ─────────────────────────────────────────
    if (!dealIds.length && lead_id) {
      const { data: lead } = await supabaseAdmin
        .from("leads")
        .select("client_id")
        .eq("id", lead_id)
        .maybeSingle();

      if (lead?.client_id) {
        const { data: deals } = await supabaseAdmin
          .from("deals")
          .select("id")
          .eq("client_id", lead.client_id)
          .eq("is_deleted", false);

        dealIds = (deals ?? []).map((d: any) => d.id);
      }

      // fallback → deals linked directly to lead
      if (!dealIds.length) {
        const { data: deals } = await supabaseAdmin
          .from("deals")
          .select("id")
          .eq("lead_id", lead_id)
          .eq("is_deleted", false);

        dealIds = (deals ?? []).map((d: any) => d.id);
      }
    }

    // ─────────────────────────────────────────
    // 3️⃣ MANUAL DEAL FILTER
    // if deal_id provided
    // ─────────────────────────────────────────
    if (deal_id) {
      dealIds = [deal_id];
    }

    if (!dealIds.length) {
      return NextResponse.json({ success: true, tasks: [] });
    }

    // ─────────────────────────────────────────
    // Auto-insert missing default tasks from
    // task_templates for each deal
    // (Purchase & Sale deals get one set per side)
    // ─────────────────────────────────────────
    for (const dId of dealIds) {
      // Get deal type to filter correct templates
      const { data: dealData } = await supabaseAdmin
        .from("deals")
        .select("type")
        .eq("id", dId)
        .single();

      const dealType = (dealData?.type ?? "Purchase").trim();
      const isBoth = dealType.toLowerCase() === "purchase & sale";
      const sides: Array<{ side: "purchase" | "sale" | null; templateType: string }> =
        isBoth
          ? [
              { side: "purchase", templateType: "Purchase" },
              { side: "sale", templateType: "Sale" },
            ]
          : [{ side: null, templateType: getTaskTemplateType(dealType) }];

      // ── Self-heal: backfill side on legacy or partially-tagged P&S rows ──
      // Mirrors the same fix in /api/milestones — for P&S deals, derive the
      // side of any null-side row from its task_template's lead_type. Without
      // this, the dashboard side filter strips them and the dedup logic below
      // would insert duplicates.
      if (isBoth) {
        const { data: nullSideRows } = await supabaseAdmin
          .from("tasks")
          .select("id, task_template_id")
          .eq("deal_id", dId)
          .is("side", null)
          .not("task_template_id", "is", null);

        if (nullSideRows && nullSideRows.length > 0) {
          const tplIds = [...new Set(nullSideRows.map((r: any) => r.task_template_id))];
          const { data: tplRows } = await supabaseAdmin
            .from("task_templates")
            .select("id, lead_type")
            .in("id", tplIds);

          const tplLeadType: Record<string, string> = Object.fromEntries(
            (tplRows ?? []).map((t: any) => [t.id, (t.lead_type ?? "").trim()])
          );

          const purchaseIds = nullSideRows
            .filter((r: any) => tplLeadType[r.task_template_id] === "Purchase")
            .map((r: any) => r.id);
          const saleIds = nullSideRows
            .filter((r: any) => tplLeadType[r.task_template_id] === "Sale")
            .map((r: any) => r.id);

          if (purchaseIds.length > 0) {
            await supabaseAdmin.from("tasks").update({ side: "purchase" }).in("id", purchaseIds);
          }
          if (saleIds.length > 0) {
            await supabaseAdmin.from("tasks").update({ side: "sale" }).in("id", saleIds);
          }
        }
      }

      // Fetch existing tasks once per deal (with side) for fast lookup
      const { data: existingTasks } = await supabaseAdmin
        .from("tasks")
        .select("task_template_id, title, side")
        .eq("deal_id", dId);

      const existingTemplateKeys = new Set(
        (existingTasks ?? [])
          .filter((t: any) => t.task_template_id)
          .map((t: any) => `${t.side ?? "_"}:${t.task_template_id}`)
      );
      const existingTitleKeys = new Set(
        (existingTasks ?? []).map(
          (t: any) => `${t.side ?? "_"}:${t.title?.trim().toLowerCase()}`
        )
      );

      // Fetch all milestones for this deal once (with side + stage_template_id)
      const { data: dealMilestones } = await supabaseAdmin
        .from("milestones")
        .select("id, stage_template_id, side")
        .eq("deal_id", dId)
        .order("order_index", { ascending: true });

      for (const { side, templateType } of sides) {
        const { data: taskTemplates } = await supabaseAdmin
          .from("task_templates")
          .select("id, name, role_type, order_index, deadline_rule, stage_template_id, is_shared")
          .eq("lead_type", templateType)
          .eq("is_default", true)
          .eq("is_deleted", false)
          .order("order_index", { ascending: true });

        if (!taskTemplates || taskTemplates.length === 0) continue;

        // Build stage_template_id → milestone_id map scoped to this side
        const stageToMilestone: Record<string, string> = {};
        for (const ms of dealMilestones ?? []) {
          if ((ms.side ?? null) !== side) continue;
          if (ms.stage_template_id) stageToMilestone[ms.stage_template_id] = ms.id;
        }

        const missingTasks = taskTemplates
          .filter((tt: any) => {
            const tplKey = `${side ?? "_"}:${tt.id}`;
            if (existingTemplateKeys.has(tplKey)) return false;
            const titleKey = `${side ?? "_"}:${tt.name?.trim().toLowerCase()}`;
            if (existingTitleKeys.has(titleKey)) return false;
            const role = (tt.role_type ?? "").toLowerCase();
            return role === "client" || role === "both" || role === "";
          })
          .map((tt: any) => ({
            deal_id: dId,
            milestone_id: tt.stage_template_id
              ? (stageToMilestone[tt.stage_template_id] ?? null)
              : null,
            task_template_id: tt.id,
            title: tt.name?.trim() ?? tt.name,
            status: "Pending",
            completed: false,
            role_type: tt.role_type ?? "client",
            is_shared: tt.is_shared ?? false,
            side,
          }));

        if (missingTasks.length > 0) {
          const { error: insertError } = await supabaseAdmin
            .from("tasks")
            .insert(missingTasks);

          if (insertError) {
            console.error(`[tasks] Auto-insert failed for deal ${dId} side ${side}:`, insertError.message);
          }
        }
      }
    }

    // ─────────────────────────────────────────
    // Fetch Tasks
    // ─────────────────────────────────────────
    const [{ data: tasks, error: tasksError }, { data: milestones }] =
      await Promise.all([
        supabaseAdmin
          .from("tasks")
          .select("*, task_template:task_templates(order_index)")
          .in("deal_id", dealIds)
          .eq("is_deleted", false)
          // Primary sort is the per-deal tasks.order_index (kept in sync with the
          // template order, and overridable per-deal from the admin deal page).
          // due_date stays as a tiebreaker for rows that lack an order_index.
          .order("order_index", { ascending: true, nullsFirst: false })
          .order("due_date", { ascending: true, nullsFirst: false }),

        supabaseAdmin
          .from("milestones")
          .select("id, title, order_index, status")
          .in("deal_id", dealIds)
          .eq("is_deleted", false),
      ]);

    if (tasksError) {
      return NextResponse.json(
        { success: false, error: tasksError.message },
        { status: 400 }
      );
    }

    // ─────────────────────────────────────────
    // Auto-sync: if milestone is Completed but
    // task is not, mark task as completed
    // ─────────────────────────────────────────
    const milestoneMap = Object.fromEntries(
      (milestones ?? []).map((m: any) => [m.id, m])
    );

    const outOfSyncTaskIds: string[] = [];
    for (const t of tasks ?? []) {
      if (t.milestone_id && !t.completed) {
        const ms = milestoneMap[t.milestone_id];
        if (ms && ms.status === "Completed") {
          outOfSyncTaskIds.push(t.id);
        }
      }
    }

    if (outOfSyncTaskIds.length > 0) {
      await supabaseAdmin
        .from("tasks")
        .update({ completed: true, status: "Completed", completed_at: new Date().toISOString() })
        .in("id", outOfSyncTaskIds);

      // Update local task data to reflect the change
      for (const t of tasks ?? []) {
        if (outOfSyncTaskIds.includes(t.id)) {
          t.completed = true;
          t.status = "Completed";
        }
      }
    }

    // ─────────────────────────────────────────
    // Reconcile shared-task completion from family peers.
    //
    // Shared tasks ("Status of Mortgage", etc.) physically exist as a separate
    // row per person. Completion is pushed once at submit time
    // (syncSharedTaskCompletion) and only reaches peer rows that already exist,
    // are linked via parent_lead_id, and are is_shared=true at that moment. A
    // co-purchaser/co-seller row created or linked AFTER the primary submitted
    // is born Pending and is never reconciled — so the admin panel (which reads
    // the primary deal's shared row) shows it complete while this portal, which
    // reads the logged-in person's OWN row, shows it Pending forever.
    //
    // Heal on read: if any family peer for the same shared task is completed,
    // mark this person's row completed too. We intentionally do NOT advance
    // milestones / trigger emails here — that would re-fire on every page load.
    // ─────────────────────────────────────────
    const sharedPending = (tasks ?? []).filter((t: any) => t.is_shared && !t.completed);

    if (sharedPending.length > 0) {
      // All OTHER deals in the lead family (primary + co-purchaser/co-seller),
      // excluding the logged-in person's own deals.
      const linkedSets = await Promise.all(dealIds.map((d) => getLinkedDealIds(d)));
      const localDealSet = new Set(dealIds);
      const familyOtherDealIds = [
        ...new Set(linkedSets.flat().filter((id) => !localDealSet.has(id))),
      ];

      if (familyOtherDealIds.length > 0) {
        const { data: peerCompleted } = await supabaseAdmin
          .from("tasks")
          .select("task_template_id, title, side")
          .in("deal_id", familyOtherDealIds)
          .eq("is_shared", true)
          .eq("completed", true)
          .eq("is_deleted", false);

        if (peerCompleted && peerCompleted.length > 0) {
          // Matching is SIDE-AWARE: a Purchase-side task only reconciles from a
          // Purchase-side peer (and Sale from Sale). "Status of Mortgage" and
          // "Schedule an Appointment" exist on both sides of a Purchase & Sale
          // family but are different obligations, so they must NOT cross-complete.
          //
          // APS tasks match by template id only — their titles are identical
          // across sides but represent different documents. Every other shared
          // task may also match by case-insensitive title (within the same side)
          // to bridge differing per-side template ids.
          const sideKey = (s: any) => (s ?? "_");
          const templateIds = [
            ...new Set(
              [...sharedPending, ...peerCompleted]
                .map((t: any) => t.task_template_id)
                .filter(Boolean)
            ),
          ];
          const apsIds = new Set<string>();
          if (templateIds.length > 0) {
            const { data: tplRows } = await supabaseAdmin
              .from("task_templates")
              .select("id, is_aps_task")
              .in("id", templateIds);
            for (const r of tplRows ?? []) {
              if (r.is_aps_task) apsIds.add(r.id);
            }
          }

          // Side-scoped lookup keys: "<side>::<template_id>" and "<side>::<title>".
          const completedTemplateKeys = new Set(
            peerCompleted
              .filter((p: any) => p.task_template_id)
              .map((p: any) => `${sideKey(p.side)}::${p.task_template_id}`)
          );
          const completedTitleKeys = new Set(
            peerCompleted
              .filter((p: any) => p.title)
              .map((p: any) => `${sideKey(p.side)}::${p.title.trim().toLowerCase()}`)
          );

          const reconcileIds: string[] = [];
          for (const t of sharedPending) {
            const byTemplate =
              t.task_template_id &&
              completedTemplateKeys.has(`${sideKey(t.side)}::${t.task_template_id}`);
            const localIsAps = t.task_template_id ? apsIds.has(t.task_template_id) : false;
            const byTitle =
              !localIsAps &&
              t.title &&
              completedTitleKeys.has(`${sideKey(t.side)}::${t.title.trim().toLowerCase()}`);
            if (byTemplate || byTitle) reconcileIds.push(t.id);
          }

          if (reconcileIds.length > 0) {
            await supabaseAdmin
              .from("tasks")
              .update({
                completed: true,
                status: "Completed",
                completed_at: new Date().toISOString(),
              })
              .in("id", reconcileIds);

            const reconcileSet = new Set(reconcileIds);
            for (const t of tasks ?? []) {
              if (reconcileSet.has(t.id)) {
                t.completed = true;
                t.status = "Completed";
              }
            }
          }
        }
      }
    }

    // ─────────────────────────────────────────
    // Attach milestone info to tasks. Also flatten the joined
    // task_template.order_index up to a top-level field so the dashboard can
    // sort "Needs Your Attention" by the per-task order configured in the
    // task_templates table.
    // ─────────────────────────────────────────
    const enriched = (tasks ?? []).map((t: any) => {
      const tpl = Array.isArray(t.task_template) ? t.task_template[0] : t.task_template;
      const { task_template, ...rest } = t;
      return {
        ...rest,
        milestones: t.milestone_id ? milestoneMap[t.milestone_id] ?? null : null,
        template_order_index: tpl?.order_index ?? null,
      };
    });

    return NextResponse.json({
      success: true,
      tasks: enriched,
      deal_ids: dealIds,
    });
  } catch (err) {
    console.error("GET /api/tasks error:", err);
    return NextResponse.json(
      { success: false, error: "Server error" },
      { status: 500 }
    );
  }
}

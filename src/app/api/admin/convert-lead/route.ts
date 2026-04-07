import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { getLinkedDealIds } from "@/lib/getLinkedDealIds";

/**
 * POST /api/admin/convert-lead
 *
 * Called by the admin panel when an admin converts a lead to a deal.
 * This endpoint:
 *   1. Creates / finds a client record
 *   2. Creates a deal linked to the client + lead
 *   3. Copies milestones from stage_templates
 *   4. Copies tasks from task_templates
 *   5. Creates a Supabase Auth user (invite email sent automatically)
 *   6. Links auth_user_id to the client record
 *
 * Expects body:
 * {
 *   lead_id: string,
 *   file_number?: string,   // e.g. "26P-0059"  (optional, auto-generated if missing)
 *   closing_date?: string,  // ISO string e.g. "2026-05-15"
 * }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { lead_id, file_number, closing_date } = body;

    if (!lead_id) {
      return NextResponse.json({ success: false, error: "lead_id is required" }, { status: 400 });
    }

    // ── 1. Fetch the lead ─────────────────────────────────────────────────────
    const { data: lead, error: leadError } = await supabaseAdmin
      .from("leads")
      .select("*")
      .eq("id", lead_id)
      .single();

    if (leadError || !lead) {
      return NextResponse.json({ success: false, error: "Lead not found" }, { status: 404 });
    }

    // Check if a deal was already auto-created by the intake route
    const { data: existingDeal } = await supabaseAdmin
      .from("deals")
      .select("id, file_number, status")
      .eq("lead_id", lead_id)
      .maybeSingle();

    // If the deal already exists AND is Active/Converted, skip re-creation
    if (existingDeal && existingDeal.status !== "Pending") {
      return NextResponse.json({
        success: false,
        error: `Lead already converted to deal ${existingDeal.file_number}`,
      }, { status: 409 });
    }

    // ── 2. Create or find client record ───────────────────────────────────────
    // If this is a co-purchaser added via intake (has parent_lead_id and different
    // email than parent), they need their OWN client record so their dashboard
    // works independently. Don't reuse the parent's client_id.
    let clientId: string;
    let needsSeparateClient = false;

    if (lead.parent_lead_id) {
      const { data: parentLead } = await supabaseAdmin
        .from("leads")
        .select("email, client_id")
        .eq("id", lead.parent_lead_id)
        .single();

      if (parentLead && parentLead.email?.toLowerCase() !== lead.email?.toLowerCase()) {
        // Co-purchaser with different email — needs own client
        needsSeparateClient = true;

        // If the lead currently shares the parent's client_id, ignore it
        if (lead.client_id && lead.client_id === parentLead.client_id) {
          lead.client_id = null;
        }
      }
    }

    if (lead.client_id && !needsSeparateClient) {
      clientId = lead.client_id;
    } else {
      // Prefer an existing client with auth_user_id (prevents duplicate clients)
      const { data: authedClients } = await supabaseAdmin
        .from("clients")
        .select("id")
        .ilike("email", lead.email)
        .not("auth_user_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1);

      if (authedClients && authedClients.length > 0) {
        clientId = authedClients[0].id;
      } else {
        const { data: existingClients } = await supabaseAdmin
          .from("clients")
          .select("id")
          .ilike("email", lead.email)
          .order("created_at", { ascending: false })
          .limit(1);

        if (existingClients && existingClients.length > 0) {
          clientId = existingClients[0].id;
        } else {
          const { data: newClient, error: clientError } = await supabaseAdmin
            .from("clients")
            .insert({
              email: lead.email,
              first_name: lead.first_name,
              last_name: lead.last_name,
              phone: lead.phone ?? null,
            })
            .select("id")
            .single();

          if (clientError || !newClient) {
            return NextResponse.json({ success: false, error: `Failed to create client: ${clientError?.message}` }, { status: 500 });
          }

          clientId = newClient.id;
        }
      }
    }

    // Back-fill lead.client_id so future flows stay linked
    if (!lead.client_id && clientId) {
      await supabaseAdmin
        .from("leads")
        .update({ client_id: clientId })
        .eq("id", lead_id);
    }

    // ── 3. Generate file number if not provided ───────────────────────────────
    const leadTypePrefix = lead.lead_type?.charAt(0)?.toUpperCase() ?? "X";
    const year = new Date().getFullYear().toString().slice(-2);
    const prefix = `${year}${leadTypePrefix}-`;

    let generatedFileNumber = file_number;
    if (!generatedFileNumber) {
      // Find the highest existing sequential number for this prefix
      const { data: lastDeal } = await supabaseAdmin
        .from("deals")
        .select("file_number")
        .like("file_number", `${prefix}%`)
        .order("file_number", { ascending: false })
        .limit(1)
        .maybeSingle();

      let nextNum = 1;
      if (lastDeal?.file_number) {
        const lastNum = parseInt(lastDeal.file_number.replace(prefix, ""), 10);
        if (!isNaN(lastNum)) nextNum = lastNum + 1;
      }

      generatedFileNumber = `${prefix}${String(nextNum).padStart(4, "0")}`;
    }

    // ── 4. Clean price (strip currency formatting) ────────────────────────────
    const rawPrice = lead.price ? String(lead.price).replace(/[^0-9.]/g, "") : null;
    const cleanPrice = rawPrice ? parseFloat(rawPrice) : null;

    // ── 5. Create or upgrade the deal ───────────────────────────────────────
    let dealId: string;

    if (existingDeal) {
      // Upgrade the auto-created Pending deal to Active
      const { error: updateErr } = await supabaseAdmin
        .from("deals")
        .update({
          client_id: clientId,
          file_number: generatedFileNumber,
          type: lead.lead_type ?? "Purchase",
          status: "Active",
          property_address: lead.address_street ?? "Address TBD",
          closing_date: closing_date ?? null,
          price: cleanPrice ?? 0,
        })
        .eq("id", existingDeal.id);

      if (updateErr) {
        return NextResponse.json({ success: false, error: `Failed to update deal: ${updateErr.message}` }, { status: 500 });
      }
      dealId = existingDeal.id;
    } else {
      const { data: deal, error: dealError } = await supabaseAdmin
        .from("deals")
        .insert({
          lead_id,
          client_id: clientId,
          file_number: generatedFileNumber,
          type: lead.lead_type ?? "Purchase",
          status: "Active",
          property_address: lead.address_street ?? "Address TBD",
          closing_date: closing_date ?? null,
          price: cleanPrice ?? 0,
        })
        .select("id")
        .single();

      if (dealError || !deal) {
        return NextResponse.json({ success: false, error: `Failed to create deal: ${dealError?.message}` }, { status: 500 });
      }
      dealId = deal.id;
    }

    // ── 6. Copy milestones from stage_templates (skip if already exist) ─────
    const leadType = lead.lead_type ?? "Purchase";
    const milestoneMap: Record<string, string> = {}; // stage_template_id → milestone_id

    // Check if milestones already exist (auto-created by intake)
    const { data: existingMilestones } = await supabaseAdmin
      .from("milestones")
      .select("id, stage_template_id")
      .eq("deal_id", dealId);

    if (existingMilestones && existingMilestones.length > 0) {
      // Use existing milestones
      for (const ms of existingMilestones) {
        if (ms.stage_template_id) milestoneMap[ms.stage_template_id] = ms.id;
      }
    } else {
      // Create milestones from templates
      const { data: stages, error: stageTemplateError } = await supabaseAdmin
        .from("stage_templates")
        .select("id, name, order_index, email_template_id, description")
        .eq("lead_type", leadType)
        .order("order_index", { ascending: true });

      if (stageTemplateError) {
        console.error("[convert-lead] Failed to fetch stage_templates:", stageTemplateError.message);
      }

      if (stages && stages.length > 0) {
        for (const stage of stages) {
          const cleanName = stage.name?.trim().replace(/^\t+/, "").replace(/^->?\s*/, "") ?? stage.name;

          const { data: ms, error: msError } = await supabaseAdmin
            .from("milestones")
            .insert({
              deal_id: dealId,
              title: cleanName,
              status: stage.order_index === 1 ? "In Progress" : stage.order_index === 2 ? "Waiting" : "Pending",
              order_index: stage.order_index,
              email_template_id: stage.email_template_id ?? null,
              stage_template_id: stage.id,
              description: stage.description ?? null,
            })
            .select("id")
            .single();

          if (msError) {
            console.error(`[convert-lead] Failed to insert milestone "${cleanName}":`, msError.message);
          }
          if (ms) milestoneMap[stage.id] = ms.id;
        }
      }
    }

    // ── 7. Copy tasks from task_templates (skip if already exist) ─────────────
    // Check if tasks already exist (auto-created by intake)
    const { data: existingTasksCheck } = await supabaseAdmin
      .from("tasks")
      .select("id")
      .eq("deal_id", dealId)
      .limit(1);

    if (!existingTasksCheck || existingTasksCheck.length === 0) {
      const { data: taskTemplates, error: taskTemplateError } = await supabaseAdmin
        .from("task_templates")
        .select("id, name, role_type, order_index, deadline_rule, stage_template_id, is_shared")
        .eq("lead_type", leadType)
        .eq("is_deleted", false)
        .order("order_index", { ascending: true });

      if (taskTemplateError) {
        console.error("[convert-lead] Failed to fetch task_templates:", taskTemplateError.message);
      }

      if (taskTemplates && taskTemplates.length > 0) {
        const milestoneIds = Object.values(milestoneMap);
        const firstMilestoneId = milestoneIds[0] ?? null;

        const taskRows = taskTemplates
          .filter((t) => {
            const role = (t.role_type ?? "").toLowerCase();
            return role === "client" || role === "both" || role === "";
          })
          .map((t) => ({
            deal_id: dealId,
            milestone_id: t.stage_template_id ? (milestoneMap[t.stage_template_id] ?? firstMilestoneId) : firstMilestoneId,
            task_template_id: t.id,
            title: t.name?.trim() ?? t.name,
            status: "Pending",
            completed: false,
            role_type: t.role_type ?? "client",
            is_shared: t.is_shared ?? false,
          }));

        if (taskRows.length > 0) {
          const { error: taskInsertError } = await supabaseAdmin.from("tasks").insert(taskRows);
          if (taskInsertError) {
            console.error("[convert-lead] Failed to insert tasks:", taskInsertError.message);
          }
        }
      }
    }

    // ── 8. Create Supabase Auth user + send invite email ──────────────────────
    let authUserId: string | null = null;
    let inviteSent = false;
    let authError: string | null = null;

    try {
      // inviteUserByEmail sends a magic link — client sets their password via the email
      const customerPortalUrl = (process.env.NEXT_PUBLIC_CUSTOMER_PORTAL_URL ?? "https://iclosed-customer-application-rosy.vercel.app").replace(/\/+$/, "");

      console.log(`[Inviting User] Email: ${lead.email}, Redirect: ${customerPortalUrl}/api/auth/callback?next=/set-password`);

      const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
        lead.email,
        {
          redirectTo: `${customerPortalUrl}/api/auth/callback?next=/set-password`,
          data: {
            first_name: lead.first_name,
            last_name: lead.last_name ?? "",
          },
        }
      );

      if (!inviteError && inviteData?.user) {
        authUserId = inviteData.user.id;
        inviteSent = true;

        // Link the auth user to the client record
        await supabaseAdmin
          .from("clients")
          .update({ auth_user_id: authUserId })
          .eq("id", clientId);
      } else if (inviteError && inviteError.code === "user_already_exists") {
        // User already exists in the system.
        console.log(`[Invite] User ${lead.email} already exists, attempting to link and send reset link instead.`);
        
        // 1. Find the user ID
        const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
        const existingUser = usersData.users.find(u => u.email?.toLowerCase() === lead.email.toLowerCase());
        
        if (existingUser) {
          authUserId = existingUser.id;
          
          await supabaseAdmin
            .from("clients")
            .update({ auth_user_id: authUserId })
            .eq("id", clientId);

          // 2. Send password reset link which acts as a "set password" flow if they haven't set one
          const { error: resetError } = await supabaseAdmin.auth.resetPasswordForEmail(
            lead.email, 
            { redirectTo: `${customerPortalUrl}/api/auth/callback?next=/set-password` }
          );

          if (!resetError) {
             inviteSent = true;
          } else {
             authError = `Already exists, but reset email failed: ${resetError.message}`;
             console.error("[Invite] Reset failed:", resetError.message);
          }
        }
      } else if (inviteError) {
        authError = inviteError.message;
        console.warn("[Invite Error] Supabase rejected invite:", inviteError.message);
      }
    } catch (err: any) {
      // Auth invite failing should not block deal creation
      authError = err.message || "Unknown auth error";
      console.error("[Invite Exception] Invite failed (non-blocking):", err);
    }

    // ── 9. Update lead status ──────────────────────────────────────────────────
    await supabaseAdmin
      .from("leads")
      .update({ status: "Converted" })
      .eq("id", lead_id);

    // ── 10. Sync shared tasks with linked deals (co-purchaser) ───────────────
    try {
      const linkedDealIds = await getLinkedDealIds(dealId);

      if (linkedDealIds.length > 0) {
        // Get all shared tasks from linked deals that are already completed
        const { data: completedSharedTasks } = await supabaseAdmin
          .from("tasks")
          .select("id, deal_id, task_template_id")
          .in("deal_id", linkedDealIds)
          .eq("is_shared", true)
          .eq("completed", true);

        if (completedSharedTasks && completedSharedTasks.length > 0) {
          for (const srcTask of completedSharedTasks) {
            // Find the matching task on the new deal
            const { data: targetTask } = await supabaseAdmin
              .from("tasks")
              .select("id, milestone_id")
              .eq("deal_id", dealId)
              .eq("task_template_id", srcTask.task_template_id)
              .eq("completed", false)
              .maybeSingle();

            if (targetTask) {
              // Copy responses
              const { data: srcResponses } = await supabaseAdmin
                .from("task_responses")
                .select("field_label, field_type, value, file_url, file_name")
                .eq("task_id", srcTask.id);

              if (srcResponses && srcResponses.length > 0) {
                await supabaseAdmin.from("task_responses").insert(
                  srcResponses.map((r) => ({ task_id: targetTask.id, ...r }))
                );
              }

              // Mark completed
              await supabaseAdmin
                .from("tasks")
                .update({ completed: true, status: "Completed", completed_at: new Date().toISOString() })
                .eq("id", targetTask.id);
            }
          }
        }
      }
    } catch (syncErr) {
      // Non-blocking
      console.warn("[convert-lead] Shared task sync failed (non-blocking):", syncErr);
    }

    return NextResponse.json({
      success: true,
      deal_id: dealId,
      file_number: generatedFileNumber,
      client_id: clientId,
      milestones_created: Object.keys(milestoneMap).length,
      invite_sent: inviteSent,
      auth_error: authError,
      message: inviteSent
        ? `Deal created and invite email sent to ${lead.email}`
        : `Deal created, but invite could not be sent: ${authError || "Create login manually"}`,
    });
  } catch (err) {
    console.error("POST /api/admin/convert-lead error:", err);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}

// Handle CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

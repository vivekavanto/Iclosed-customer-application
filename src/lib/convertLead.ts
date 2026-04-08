import supabaseAdmin from "@/lib/supabaseAdmin";
import { getLinkedDealIds } from "@/lib/getLinkedDealIds";
import { advanceMilestone } from "@/lib/syncSharedTask";

export interface ConvertLeadResult {
  success: boolean;
  deal_id: string;
  file_number: string;
  client_id: string;
  invite_sent: boolean;
  auth_error?: string | null;
  error?: string;
}

/**
 * Converts a single lead into a deal with client, milestones, tasks, and auth invite.
 * Used by both admin convert-lead and auto-conversion flows.
 *
 * Does NOT convert co-purchaser leads — call this separately for each.
 * Does NOT sync shared tasks — caller should do that after all leads are converted.
 */
export async function convertSingleLead(params: {
  lead: any;
  parentClientId?: string | null;
  closingDate?: string | null;
  fileNumber?: string | null;
}): Promise<ConvertLeadResult> {
  const { lead, parentClientId, closingDate, fileNumber } = params;

  // ── 1. Create or find client ────────────────────────────────────────
  let clientId: string;
  let needsSeparateClient = false;

  if (lead.parent_lead_id) {
    const { data: parentLead } = await supabaseAdmin
      .from("leads")
      .select("email, client_id")
      .eq("id", lead.parent_lead_id)
      .single();

    if (parentLead && parentLead.email?.toLowerCase() !== lead.email?.toLowerCase()) {
      needsSeparateClient = true;
      if (lead.client_id && lead.client_id === parentLead.client_id) {
        lead.client_id = null;
      }
    }
  }

  if (lead.client_id && !needsSeparateClient) {
    clientId = lead.client_id;
  } else if (!needsSeparateClient && parentClientId) {
    clientId = parentClientId;
  } else {
    // Search for existing client by email
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
          return { success: false, deal_id: "", file_number: "", client_id: "", invite_sent: false, error: `Client creation failed: ${clientError?.message}` };
        }
        clientId = newClient.id;
      }
    }
  }

  // Back-fill client_id on lead
  if (clientId && (!lead.client_id || needsSeparateClient)) {
    await supabaseAdmin.from("leads").update({ client_id: clientId }).eq("id", lead.id);
  }

  // ── 2. Generate file number ─────────────────────────────────────────
  const leadTypePrefix = lead.lead_type?.charAt(0)?.toUpperCase() ?? "X";
  const year = new Date().getFullYear().toString().slice(-2);
  const prefix = `${year}${leadTypePrefix}-`;

  let generatedFileNumber = fileNumber ?? null;
  if (!generatedFileNumber) {
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

  // ── 3. Clean price ──────────────────────────────────────────────────
  const rawPrice = lead.price ? String(lead.price).replace(/[^0-9.]/g, "") : null;
  const cleanPrice = rawPrice ? parseFloat(rawPrice) : null;

  // ── 4. Create deal ──────────────────────────────────────────────────
  const { data: deal, error: dealError } = await supabaseAdmin
    .from("deals")
    .insert({
      lead_id: lead.id,
      client_id: clientId,
      file_number: generatedFileNumber,
      type: lead.lead_type ?? "Purchase",
      status: "Active",
      property_address: lead.address_street ?? "Address TBD",
      closing_date: closingDate ?? null,
      price: cleanPrice ?? 0,
    })
    .select("id")
    .single();

  if (dealError || !deal) {
    return { success: false, deal_id: "", file_number: generatedFileNumber, client_id: clientId, invite_sent: false, error: `Deal creation failed: ${dealError?.message}` };
  }

  // ── 5. Create milestones ────────────────────────────────────────────
  const leadType = lead.lead_type ?? "Purchase";
  const milestoneMap: Record<string, string> = {};

  const { data: stages } = await supabaseAdmin
    .from("stage_templates")
    .select("id, name, order_index, email_template_id, description")
    .eq("lead_type", leadType)
    .order("order_index", { ascending: true });

  if (stages && stages.length > 0) {
    for (const stage of stages) {
      const cleanName = stage.name?.trim().replace(/^\t+/, "").replace(/^->?\s*/, "") ?? stage.name;
      const { data: ms } = await supabaseAdmin
        .from("milestones")
        .insert({
          deal_id: deal.id,
          title: cleanName,
          status: stage.order_index === 1 ? "In Progress" : stage.order_index === 2 ? "Waiting" : "Pending",
          order_index: stage.order_index,
          email_template_id: stage.email_template_id ?? null,
          stage_template_id: stage.id,
          description: stage.description ?? null,
        })
        .select("id")
        .single();
      if (ms) milestoneMap[stage.id] = ms.id;
    }
  }

  // ── 6. Create tasks ─────────────────────────────────────────────────
  const { data: taskTemplates } = await supabaseAdmin
    .from("task_templates")
    .select("id, name, role_type, order_index, deadline_rule, stage_template_id, is_shared")
    .eq("lead_type", leadType)
    .eq("is_deleted", false)
    .order("order_index", { ascending: true });

  if (taskTemplates && taskTemplates.length > 0) {
    const milestoneIds = Object.values(milestoneMap);
    const firstMilestoneId = milestoneIds[0] ?? null;

    const taskRows = taskTemplates
      .filter((t) => {
        const role = (t.role_type ?? "").toLowerCase();
        return role === "client" || role === "both" || role === "";
      })
      .map((t) => ({
        deal_id: deal.id,
        milestone_id: t.stage_template_id ? (milestoneMap[t.stage_template_id] ?? firstMilestoneId) : firstMilestoneId,
        task_template_id: t.id,
        title: t.name?.trim() ?? t.name,
        status: "Pending",
        completed: false,
        role_type: t.role_type ?? "client",
        is_shared: t.is_shared ?? false,
      }));

    if (taskRows.length > 0) {
      await supabaseAdmin.from("tasks").insert(taskRows);
    }
  }

  // ── 7. Auth invite ──────────────────────────────────────────────────
  const customerPortalUrl = (process.env.NEXT_PUBLIC_CUSTOMER_PORTAL_URL ?? "https://iclosed-customer-application-rosy.vercel.app").replace(/\/+$/, "");
  let inviteSent = false;
  let authError: string | null = null;

  try {
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      lead.email,
      {
        redirectTo: `${customerPortalUrl}/api/auth/callback?next=/set-password`,
        data: { first_name: lead.first_name, last_name: lead.last_name ?? "" },
      }
    );

    if (!inviteError && inviteData?.user) {
      await supabaseAdmin.from("clients").update({ auth_user_id: inviteData.user.id }).eq("id", clientId);
      inviteSent = true;
    } else if (inviteError?.code === "user_already_exists") {
      const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
      const existingUser = usersData.users.find((u: any) => u.email?.toLowerCase() === lead.email.toLowerCase());
      if (existingUser) {
        await supabaseAdmin.from("clients").update({ auth_user_id: existingUser.id }).eq("id", clientId);
        const { error: resetErr } = await supabaseAdmin.auth.resetPasswordForEmail(
          lead.email,
          { redirectTo: `${customerPortalUrl}/api/auth/callback?next=/set-password` }
        );
        inviteSent = !resetErr;
        if (resetErr) authError = `Reset email failed: ${resetErr.message}`;
      }
    } else if (inviteError) {
      authError = inviteError.message;
    }
  } catch (err: any) {
    authError = err.message || "Unknown auth error";
    console.error(`[convertLead] Auth invite failed for ${lead.email}:`, err);
  }

  // ── 8. Mark lead as Converted ───────────────────────────────────────
  await supabaseAdmin.from("leads").update({ status: "Converted" }).eq("id", lead.id);

  return {
    success: true,
    deal_id: deal.id,
    file_number: generatedFileNumber,
    client_id: clientId,
    invite_sent: inviteSent,
    auth_error: authError,
  };
}

/**
 * Syncs completed shared tasks across all linked deals.
 * Call this AFTER all co-purchaser deals have been created.
 */
export async function syncSharedTasksAcrossDeals(dealId: string): Promise<void> {
  const allLinkedDealIds = await getLinkedDealIds(dealId);
  if (allLinkedDealIds.length === 0) return;

  const allDealIds = [dealId, ...allLinkedDealIds];

  const { data: completedSharedTasks } = await supabaseAdmin
    .from("tasks")
    .select("id, deal_id, task_template_id")
    .in("deal_id", allDealIds)
    .eq("is_shared", true)
    .eq("completed", true);

  if (!completedSharedTasks || completedSharedTasks.length === 0) return;

  for (const srcTask of completedSharedTasks) {
    for (const targetDealId of allDealIds) {
      if (targetDealId === srcTask.deal_id) continue;

      const { data: targetTask } = await supabaseAdmin
        .from("tasks")
        .select("id, milestone_id")
        .eq("deal_id", targetDealId)
        .eq("task_template_id", srcTask.task_template_id)
        .eq("completed", false)
        .maybeSingle();

      if (targetTask) {
        const { data: srcResponses } = await supabaseAdmin
          .from("task_responses")
          .select("field_label, field_type, value, file_url, file_name")
          .eq("task_id", srcTask.id);

        if (srcResponses && srcResponses.length > 0) {
          await supabaseAdmin.from("task_responses").insert(
            srcResponses.map((r) => ({ task_id: targetTask.id, ...r }))
          );
        }

        await supabaseAdmin
          .from("tasks")
          .update({ completed: true, status: "Completed", completed_at: new Date().toISOString() })
          .eq("id", targetTask.id);

        if (targetTask.milestone_id) {
          await advanceMilestone(targetDealId, targetTask.milestone_id);
        }
      }
    }
  }
}

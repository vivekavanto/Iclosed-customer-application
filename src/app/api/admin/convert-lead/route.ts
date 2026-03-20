import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";

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

    // Check that this lead hasn't already been converted
    const { data: existingDeal } = await supabaseAdmin
      .from("deals")
      .select("id, file_number")
      .eq("lead_id", lead_id)
      .maybeSingle();

    if (existingDeal) {
      return NextResponse.json({
        success: false,
        error: `Lead already converted to deal ${existingDeal.file_number}`,
      }, { status: 409 });
    }

    // ── 2. Create or find client record ───────────────────────────────────────
    let clientId: string;

    const { data: existingClients } = await supabaseAdmin
      .from("clients")
      .select("id")
      .eq("email", lead.email)
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

    // ── 3. Generate file number if not provided ───────────────────────────────
    const leadTypePrefix = lead.lead_type?.charAt(0)?.toUpperCase() ?? "X";
    const year = new Date().getFullYear().toString().slice(-2);
    const shortId = lead_id.substring(0, 4).toUpperCase();
    const generatedFileNumber = file_number ?? `${year}${leadTypePrefix}-${shortId}`;

    // ── 4. Clean price (strip currency formatting) ────────────────────────────
    const rawPrice = lead.price ? String(lead.price).replace(/[^0-9.]/g, "") : null;
    const cleanPrice = rawPrice ? parseFloat(rawPrice) : null;

    // ── 5. Create the deal ────────────────────────────────────────────────────
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

    const dealId = deal.id;

    // ── 6. Copy milestones from stage_templates ───────────────────────────────
    const leadType = lead.lead_type ?? "Purchase";

    const { data: stages, error: stageTemplateError } = await supabaseAdmin
      .from("stage_templates")
      .select("id, name, order_index, email_template_id")
      .eq("lead_type", leadType)
      .order("order_index", { ascending: true });

    if (stageTemplateError) {
      console.error("[convert-lead] Failed to fetch stage_templates:", stageTemplateError.message);
    }

    const milestoneMap: Record<string, string> = {}; // stage_template_id → milestone_id

    if (stages && stages.length > 0) {
      for (const stage of stages) {
        const cleanName = stage.name?.trim().replace(/^\t+/, "").replace(/^->?\s*/, "") ?? stage.name;

        const { data: ms, error: msError } = await supabaseAdmin
          .from("milestones")
          .insert({
            deal_id: dealId,
            title: cleanName,
            status: stage.order_index === 1 ? "In Progress" : "Pending",
            order_index: stage.order_index,
            email_template_id: stage.email_template_id ?? null,
            stage_template_id: stage.id,
          })
          .select("id")
          .single();

        if (msError) {
          console.error(`[convert-lead] Failed to insert milestone "${cleanName}":`, msError.message);
        }
        if (ms) milestoneMap[stage.id] = ms.id;
      }
    }

    // ── 7. Copy tasks from task_templates ─────────────────────────────────────
    const { data: taskTemplates, error: taskTemplateError } = await supabaseAdmin
      .from("task_templates")
      .select("id, name, role_type, order_index, deadline_rule, stage_template_id")
      .eq("lead_type", leadType)
      .eq("is_deleted", false)
      .order("order_index", { ascending: true });

    if (taskTemplateError) {
      console.error("[convert-lead] Failed to fetch task_templates:", taskTemplateError.message);
    }

    if (taskTemplates && taskTemplates.length > 0) {
      // Build ordered list of milestone IDs to distribute tasks across milestones
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
        }));

      if (taskRows.length > 0) {
        const { error: taskInsertError } = await supabaseAdmin.from("tasks").insert(taskRows);
        if (taskInsertError) {
          console.error("[convert-lead] Failed to insert tasks:", taskInsertError.message);
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

    return NextResponse.json({
      success: true,
      deal_id: dealId,
      file_number: generatedFileNumber,
      client_id: clientId,
      milestones_created: Object.keys(milestoneMap).length,
      tasks_created: taskTemplates?.filter((t) => {
        const role = (t.role_type ?? "").toLowerCase();
        return role === "client" || role === "both" || role === "";
      }).length ?? 0,
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

import supabaseAdmin from "@/lib/supabaseAdmin";
import { getAuthClient, getAuthUser } from "@/lib/getAuthClient";
import { getLinkedDealIds } from "@/lib/getLinkedDealIds";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      first_name,
      last_name,
      email,
      phone,
      service,
      sub_service,
      price,
      address_street,
      address_unit,
      address_city,
      address_postal_code,
      address_province,
      selling_address_street,
      selling_address_unit,
      selling_address_city,
      selling_address_postal_code,
      selling_address_province,
      aps_signed,
      co_persons,
      referral_source,
    } = body;

    // ── Lead type ─────────────────────────────────────────────
    let lead_type = null;
    if (service === "closing") {
      if (sub_service === "buying") lead_type = "Purchase";
      else if (sub_service === "selling") lead_type = "Sale";
      else if (sub_service === "both") lead_type = "Purchase & Sale";
    }
    if (service === "refinance") lead_type = "Refinance";
    if (service === "condo") lead_type = "Condo";

    const cleanPrice = price ? String(price).replace(/[^0-9.]/g, "") : null;

    // ── Purchase & Sale: buying and selling address can't be the same ──
    if (sub_service === "both" && address_street && selling_address_street) {
      const buyStreet = (address_street ?? "").trim().toLowerCase();
      const sellStreet = (selling_address_street ?? "").trim().toLowerCase();
      const buyCity = (address_city ?? "").trim().toLowerCase();
      const sellCity = (selling_address_city ?? "").trim().toLowerCase();
      const buyPostal = (address_postal_code ?? "").trim().toLowerCase().replace(/\s/g, "");
      const sellPostal = (selling_address_postal_code ?? "").trim().toLowerCase().replace(/\s/g, "");

      if (buyStreet === sellStreet && buyCity === sellCity && buyPostal === sellPostal) {
        return NextResponse.json(
          { success: false, error: "The purchasing and selling property addresses cannot be the same." },
          { status: 400 }
        );
      }
    }

    // ── Duplicate check: same email + same address ────────────
    const normEmail = (email ?? "").trim().toLowerCase();
    const normStreet = (address_street ?? "").trim().toLowerCase();
    const normCity = (address_city ?? "").trim().toLowerCase();
    const normPostal = (address_postal_code ?? "").trim().toLowerCase().replace(/\s/g, "");

    if (normEmail && normStreet && normCity) {
      const { data: existingLeads, error: dupCheckErr } = await supabaseAdmin
        .from("leads")
        .select("id, email, address_street, address_city, address_postal_code")
        .ilike("email", normEmail);

      if (!dupCheckErr && existingLeads && existingLeads.length > 0) {
        const duplicate = existingLeads.find((l) => {
          const lStreet = (l.address_street ?? "").trim().toLowerCase();
          const lCity = (l.address_city ?? "").trim().toLowerCase();
          const lPostal = (l.address_postal_code ?? "").trim().toLowerCase().replace(/\s/g, "");
          return lStreet === normStreet && lCity === normCity && lPostal === normPostal;
        });

        if (duplicate) {
          return NextResponse.json(
            { success: false, error: "You already have a submission for this address. Please contact us if you need to make changes." },
            { status: 409 }
          );
        }
      }
    }

    // ── 1. Resolve client ID ──────────────────────────────────
    let clientId: string | null = null;

    try {
      const authClient = await getAuthClient();
      clientId = authClient?.id ?? null;

      if (!clientId && email) {
        const { data: clientsByEmail } = await supabaseAdmin
          .from("clients")
          .select("id")
          .ilike("email", email.toLowerCase().trim())
          .order("created_at", { ascending: false })
          .limit(1);
        clientId = clientsByEmail?.[0]?.id ?? null;
      }

      if (!clientId) {
        const authUser = await getAuthUser();
        if (authUser?.id) {
          const { data: clientsByAuth } = await supabaseAdmin
            .from("clients")
            .select("id")
            .eq("auth_user_id", authUser.id)
            .order("created_at", { ascending: false })
            .limit(1);
          clientId = clientsByAuth?.[0]?.id ?? null;
        }
      }
    } catch (e) {
      console.warn("Client fetch failed:", e);
    }

    // ── 2. Insert Lead ────────────────────────────────────────
    const { data: lead, error } = await supabaseAdmin
      .from("leads")
      .insert({
        first_name,
        last_name,
        email,
        phone,
        service,
        sub_service: service === "closing" ? sub_service : null,
        lead_type,
        price: cleanPrice,
        address_street,
        address_unit,
        address_city,
        address_postal_code,
        address_province,
        selling_address_street,
        selling_address_unit,
        selling_address_city,
        selling_address_postal_code,
        selling_address_province,
        aps_signed,
        co_persons: co_persons ?? [],
        referral_source: referral_source || null,
        client_id: clientId,
      })
      .select()
      .single();

    if (error) {
      console.error("Insert error:", error);
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    // ── 3. Create co-person leads ─────────────────────────────
    const coPersonLeadIds: string[] = [];

    if (Array.isArray(co_persons) && co_persons.length > 0) {
      for (const cp of co_persons) {
        try {
          const [cpFirst, ...cpRest] = (cp.fullName ?? "").split(" ");
          const cpLast = cpRest.join(" ");

          const { data: cpLead, error: cpError } = await supabaseAdmin
            .from("leads")
            .insert({
              first_name: cpFirst || "",
              last_name: cpLast || "",
              email: cp.email,
              phone: cp.phone || null,
              service,
              sub_service: service === "closing" ? sub_service : null,
              lead_type,
              price: cleanPrice,
              address_street,
              address_unit,
              address_city,
              address_postal_code,
              address_province,
              selling_address_street,
              selling_address_unit,
              selling_address_city,
              selling_address_postal_code,
              selling_address_province,
              aps_signed,
              co_persons: [],
              parent_lead_id: lead.id,
              client_id: clientId,
            })
            .select("id")
            .single();

          if (cpError) {
            console.warn(`[Intake] Co-person lead insert failed for ${cp.email}:`, cpError.message);
          } else if (cpLead) {
            coPersonLeadIds.push(cpLead.id);
          }
        } catch (cpErr) {
          console.warn("[Intake] Co-person lead creation failed (non-blocking):", cpErr);
        }
      }
    }

    // ── 4. Ensure client exists (post-insert safety) ──────────
    if (!clientId) {
      const authUser = await getAuthUser();

      if (authUser?.id) {
        const { data: clientsByAuth } = await supabaseAdmin
          .from("clients")
          .select("id")
          .eq("auth_user_id", authUser.id)
          .order("created_at", { ascending: false })
          .limit(1);
        clientId = clientsByAuth?.[0]?.id ?? null;
      }

      if (!clientId && email) {
        const { data: clientsByEmail } = await supabaseAdmin
          .from("clients")
          .select("id")
          .ilike("email", email.toLowerCase().trim())
          .order("created_at", { ascending: false })
          .limit(1);
        clientId = clientsByEmail?.[0]?.id ?? null;
      }

      if (!clientId && email) {
        const { data: newClient, error: clientError } = await supabaseAdmin
          .from("clients")
          .insert({
            email: email.toLowerCase().trim(),
            first_name,
            last_name,
            phone: phone ?? null,
            auth_user_id: authUser?.id ?? null,
          })
          .select("id")
          .single();

        if (!clientError && newClient) {
          clientId = newClient.id;
        }
      }

      // Back-fill client_id on lead + co-person leads
      if (clientId) {
        await supabaseAdmin
          .from("leads")
          .update({ client_id: clientId })
          .eq("id", lead.id);

        for (const cpId of coPersonLeadIds) {
          await supabaseAdmin
            .from("leads")
            .update({ client_id: clientId })
            .eq("id", cpId);
        }
      }
    }

    // ── 5. Auto-create deal + milestones + tasks ──────────────
    let dealId: string | null = null;
    let autoLinked = false;

    if (clientId) {
      // Guard: skip if a deal already exists for this lead
      const { data: existingDeal } = await supabaseAdmin
        .from("deals")
        .select("id")
        .eq("lead_id", lead.id)
        .maybeSingle();

      if (!existingDeal) {
        // ── Generate sequential file number ───────────────────
        const typePrefix =
          lead_type === "Purchase" ? "P"
            : lead_type === "Sale" ? "S"
            : lead_type === "Purchase & Sale" ? "PS"
            : lead_type === "Refinance" ? "R"
            : lead_type === "Condo" ? "C"
            : "L";

        const year = new Date().getFullYear().toString().slice(-2);
        const prefix = `${year}${typePrefix}-`;

        const { data: existingDeals } = await supabaseAdmin
          .from("deals")
          .select("file_number")
          .like("file_number", `${prefix}%`);

        let nextNum = 1;
        if (existingDeals && existingDeals.length > 0) {
          for (const d of existingDeals) {
            const num = parseInt(d.file_number.replace(prefix, ""), 10);
            if (!isNaN(num) && num >= nextNum) nextNum = num + 1;
          }
        }

        const file_number = `${prefix}${String(nextNum).padStart(4, "0")}`;

        // ── Insert deal ───────────────────────────────────────
        const { data: newDeal, error: dealInsertError } = await supabaseAdmin
          .from("deals")
          .insert({
            lead_id: lead.id,
            client_id: clientId,
            file_number,
            type: lead_type,
            status: "Pending",
            property_address: address_street || null,
            price: cleanPrice ? parseFloat(cleanPrice) : null,
          })
          .select("id")
          .single();

        if (dealInsertError) {
          console.error("[Intake] Auto-deal creation failed:", dealInsertError.message);
        } else if (newDeal) {
          dealId = newDeal.id;
        }
      } else {
        dealId = existingDeal.id;
      }

      autoLinked = true;
    }

    // ── 6. Create milestones from stage_templates ─────────────
    const milestoneMap: Record<string, string> = {}; // stage_template_id → milestone_id

    if (dealId) {
      const leadType = lead_type ?? "Purchase";

      const { data: stages, error: stageErr } = await supabaseAdmin
        .from("stage_templates")
        .select("id, name, order_index, email_template_id, description")
        .eq("lead_type", leadType)
        .order("order_index", { ascending: true });

      if (stageErr) {
        console.error("[Intake] Failed to fetch stage_templates:", stageErr.message);
      }

      // Check if milestones already exist for this deal
      const { data: existingMilestones } = await supabaseAdmin
        .from("milestones")
        .select("id")
        .eq("deal_id", dealId)
        .limit(1);

      if (stages && stages.length > 0 && (!existingMilestones || existingMilestones.length === 0)) {
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
            console.error(`[Intake] Failed to insert milestone "${cleanName}":`, msError.message);
          }
          if (ms) milestoneMap[stage.id] = ms.id;
        }
      }
    }

    // ── 7. Create tasks from task_templates ────────────────────
    if (dealId) {
      const leadType = lead_type ?? "Purchase";

      const { data: taskTemplates, error: ttErr } = await supabaseAdmin
        .from("task_templates")
        .select("id, name, role_type, order_index, deadline_rule, stage_template_id, is_shared")
        .eq("lead_type", leadType)
        .eq("is_deleted", false)
        .order("order_index", { ascending: true });

      if (ttErr) {
        console.error("[Intake] Failed to fetch task_templates:", ttErr.message);
      }

      // Check if tasks already exist for this deal
      const { data: existingTasks } = await supabaseAdmin
        .from("tasks")
        .select("id")
        .eq("deal_id", dealId)
        .limit(1);

      if (taskTemplates && taskTemplates.length > 0 && (!existingTasks || existingTasks.length === 0)) {
        const milestoneIds = Object.values(milestoneMap);
        const firstMilestoneId = milestoneIds[0] ?? null;

        const taskRows = taskTemplates
          .filter((t) => {
            const role = (t.role_type ?? "").toLowerCase();
            return role === "client" || role === "both" || role === "";
          })
          .map((t) => ({
            deal_id: dealId,
            milestone_id: t.stage_template_id
              ? (milestoneMap[t.stage_template_id] ?? firstMilestoneId)
              : firstMilestoneId,
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
            console.error("[Intake] Failed to insert tasks:", taskInsertError.message);
          }
        }
      }
    }

    // ── 8. Address match detection (co-purchaser) ─────────────
    // Flags when a DIFFERENT person (different email) submits for the same address.
    let addressMatch = false;
    let matchedLeadId: string | null = null;

    try {
      if (normStreet && normCity && normPostal) {
        const excludeIds = [lead.id, ...coPersonLeadIds];
        const { data: matchingLeads } = await supabaseAdmin
          .from("leads")
          .select("id, address_postal_code")
          .not("id", "in", `(${excludeIds.join(",")})`)
          .neq("email", normEmail)
          .is("parent_lead_id", null)
          .ilike("address_street", normStreet)
          .ilike("address_city", normCity);

        if (matchingLeads && matchingLeads.length > 0) {
          const matched = matchingLeads.find((ml) => {
            const mlPostal = (ml.address_postal_code ?? "").trim().toLowerCase().replace(/\s/g, "");
            return mlPostal === normPostal;
          });

          if (matched) {
            matchedLeadId = matched.id;

            // Flag this lead as a co-purchaser match
            await supabaseAdmin
              .from("leads")
              .update({
                address_match_flag: {
                  matched_lead_id: matched.id,
                  status: "pending",
                },
              })
              .eq("id", lead.id);

            // Link as co-purchaser: set parent_lead_id to the matched lead
            await supabaseAdmin
              .from("leads")
              .update({ parent_lead_id: matched.id })
              .eq("id", lead.id);

            addressMatch = true;
          }
        }
      }
    } catch (matchErr) {
      console.warn("[Intake] Address match check failed (non-blocking):", matchErr);
    }

    // ── 9. Sync shared tasks with co-purchaser ────────────────
    // If this new deal is linked to a co-purchaser, sync any already-completed
    // shared tasks from the matched deal so progress stays in parallel.
    if (dealId && matchedLeadId) {
      try {
        const linkedDealIds = await getLinkedDealIds(dealId);

        if (linkedDealIds.length > 0) {
          const { data: completedSharedTasks } = await supabaseAdmin
            .from("tasks")
            .select("id, deal_id, task_template_id")
            .in("deal_id", linkedDealIds)
            .eq("is_shared", true)
            .eq("completed", true);

          if (completedSharedTasks && completedSharedTasks.length > 0) {
            for (const srcTask of completedSharedTasks) {
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
        console.warn("[Intake] Shared task sync failed (non-blocking):", syncErr);
      }
    }

    // ── 10. Trigger welcome email (fire and forget) ───────────
    const adminUrl = process.env.NEXT_PUBLIC_ADMIN_PORTAL_URL || "https://iclosed-admin-panel.vercel.app";
    fetch(`${adminUrl}/api/webhooks/new-lead`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead_id: lead.id }),
    }).catch((err) => console.error("[Intake] Welcome email trigger failed:", err));

    for (const cpLeadId of coPersonLeadIds) {
      fetch(`${adminUrl}/api/webhooks/new-lead`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: cpLeadId }),
      }).catch((err) => console.error(`[Intake] Co-person welcome email failed for ${cpLeadId}:`, err));
    }

    return NextResponse.json({
      success: true,
      lead_id: lead.id,
      deal_id: dealId,
      auto_linked: autoLinked,
      address_match: addressMatch,
      co_person_leads_created: coPersonLeadIds.length,
    });

  } catch (err) {
    console.error("Server error:", err);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}

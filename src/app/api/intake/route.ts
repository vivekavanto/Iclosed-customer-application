import supabaseAdmin from "@/lib/supabaseAdmin";
import { getAuthClient, getAuthUser } from "@/lib/getAuthClient";
import { sendWelcomeEmail } from "@/lib/sendWelcomeEmail";
import { sendLeadNotificationEmail } from "@/lib/sendLeadNotificationEmail";
import { convertSingleLead, syncSharedTasksAcrossDeals } from "@/lib/convertLead";
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

    // ── 4. Address match detection (co-purchaser) ─────────────
    // Flags when a DIFFERENT person (different email) submits for the same address.
    // If the matched lead is already Converted (has a deal), auto-link + auto-convert.
    let addressMatch = false;
    let autoConverted = false;

    try {
      if (normStreet && normCity && normPostal) {
        const excludeIds = [lead.id, ...coPersonLeadIds];
        const { data: matchingLeads } = await supabaseAdmin
          .from("leads")
          .select("id, status, address_postal_code")
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
            addressMatch = true;

            if (matched.status === "Converted") {
              // Matched lead already has a deal — auto-link + auto-convert this lead
              // Set parent_lead_id to link as co-purchaser
              await supabaseAdmin
                .from("leads")
                .update({
                  parent_lead_id: matched.id,
                  address_match_flag: { matched_lead_id: matched.id, status: "approved" },
                })
                .eq("id", lead.id);

              // Also link any co-person leads
              for (const cpId of coPersonLeadIds) {
                await supabaseAdmin
                  .from("leads")
                  .update({ parent_lead_id: matched.id })
                  .eq("id", cpId);
              }

              // Re-fetch lead with updated parent_lead_id
              const { data: updatedLead } = await supabaseAdmin
                .from("leads")
                .select("*")
                .eq("id", lead.id)
                .single();

              if (updatedLead) {
                // Auto-convert this lead (creates client, deal, milestones, tasks, invite)
                const result = await convertSingleLead({ lead: updatedLead });

                if (result.success) {
                  autoConverted = true;

                  // Auto-convert co-person leads too
                  for (const cpId of coPersonLeadIds) {
                    const { data: cpLead } = await supabaseAdmin
                      .from("leads")
                      .select("*")
                      .eq("id", cpId)
                      .single();

                    if (cpLead) {
                      await convertSingleLead({
                        lead: cpLead,
                        parentClientId: result.client_id,
                      });
                    }
                  }

                  // Sync shared tasks across all linked deals
                  try {
                    await syncSharedTasksAcrossDeals(result.deal_id);
                  } catch (syncErr) {
                    console.warn("[Intake] Shared task sync failed (non-blocking):", syncErr);
                  }
                }
              }
            } else {
              // Matched lead is NOT converted yet — just flag for admin review
              await supabaseAdmin
                .from("leads")
                .update({
                  address_match_flag: { matched_lead_id: matched.id, status: "pending" },
                })
                .eq("id", lead.id);
            }
          }
        }
      }
    } catch (matchErr) {
      console.warn("[Intake] Address match check failed (non-blocking):", matchErr);
    }

    // ── 5. Trigger welcome email ───────────────────────────────
    // Skip welcome email if auto-converted (invite email already sent by convertSingleLead)
    if (!autoConverted) {
      try {
        await sendWelcomeEmail(lead.id);
        await Promise.all(
          coPersonLeadIds.map((cpLeadId) => sendWelcomeEmail(cpLeadId))
        );
      } catch (err) {
        console.error("[Intake] Welcome email failed:", err);
      }
    }

    // ── 6. Notify iClosed team of new intake (non-blocking) ────
    sendLeadNotificationEmail(lead.id).catch((err) =>
      console.error("[Intake] Team notification failed:", err)
    );

    return NextResponse.json({
      success: true,
      lead_id: lead.id,
      address_match: addressMatch,
      auto_converted: autoConverted,
      co_person_leads_created: coPersonLeadIds.length,
    });

  } catch (err) {
    console.error("Server error:", err);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}

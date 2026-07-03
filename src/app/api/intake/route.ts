import supabaseAdmin from "@/lib/supabaseAdmin";
import { getAuthClient, getAuthUser } from "@/lib/getAuthClient";
import { sendWelcomeEmail } from "@/lib/sendWelcomeEmail";
import { sendLeadNotificationEmail } from "@/lib/sendLeadNotificationEmail";
import { findClientByName, followMergedClient, nameMatchesClient } from "@/lib/clientNames";
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
      selling_price,
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
      aps_signed_purchase,
      aps_signed_sale,
      co_persons,
      document_upload_mode,
      document_uploader_co_person_id,
      referral_source,
    } = body;

    // Per-side APS flags drive Buy & Sell. For single-side flows the legacy
    // aps_signed flag is mapped onto the matching side so older callers still work.
    const apsPurchase =
      typeof aps_signed_purchase === "boolean"
        ? aps_signed_purchase
        : sub_service === "buying"
          ? !!aps_signed
          : null;
    const apsSale =
      typeof aps_signed_sale === "boolean"
        ? aps_signed_sale
        : sub_service === "selling"
          ? !!aps_signed
          : null;
    const apsSignedAggregate = !!apsPurchase || !!apsSale || !!aps_signed;

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
    const cleanSellingPrice =
      sub_service === "both" && selling_price
        ? String(selling_price).replace(/[^0-9.]/g, "")
        : null;
    const hasCoPersons = Array.isArray(co_persons) && co_persons.length > 0;
    const uploadMode =
      document_upload_mode === "me" ||
      document_upload_mode === "co" ||
      document_upload_mode === "both"
        ? document_upload_mode
        : null;

    if (hasCoPersons && !uploadMode) {
      return NextResponse.json(
        { success: false, error: "Please choose who will upload documents." },
        { status: 400 }
      );
    }

    if (uploadMode === "co") {
      const selectedUploaderExists = (co_persons as Array<{ id?: string }>).some(
        (cp) => cp?.id === document_uploader_co_person_id
      );
      if (!document_uploader_co_person_id || !selectedUploaderExists) {
        return NextResponse.json(
          { success: false, error: "Selected document uploader is not valid." },
          { status: 400 }
        );
      }
    }

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

    // ── Duplicate check: same email OR same name (incl. aliases) + same address ────
    const normEmail = (email ?? "").trim().toLowerCase();
    const normFirst = (first_name ?? "").trim().toLowerCase();
    const normLast = (last_name ?? "").trim().toLowerCase();
    const normStreet = (address_street ?? "").trim().toLowerCase();
    // Unit is part of the address identity — two different units in the same
    // building share street/city/postal, so without this a unit-15 intake would
    // wrongly match a unit-12 lead and get auto-linked to its deal.
    const normUnit = (address_unit ?? "").trim().toLowerCase().replace(/\s/g, "");
    const normCity = (address_city ?? "").trim().toLowerCase();
    const normPostal = (address_postal_code ?? "").trim().toLowerCase().replace(/\s/g, "");

    const matchesAddress = (l: { address_street: string | null; address_unit: string | null; address_city: string | null; address_postal_code: string | null }) => {
      const lStreet = (l.address_street ?? "").trim().toLowerCase();
      const lUnit = (l.address_unit ?? "").trim().toLowerCase().replace(/\s/g, "");
      const lCity = (l.address_city ?? "").trim().toLowerCase();
      const lPostal = (l.address_postal_code ?? "").trim().toLowerCase().replace(/\s/g, "");
      return lStreet === normStreet && lUnit === normUnit && lCity === normCity && lPostal === normPostal;
    };

    if (normStreet && normCity) {
      // a) email-based duplicate (existing behaviour)
      if (normEmail) {
        const { data: existingLeads } = await supabaseAdmin
          .from("leads")
          .select("id, email, address_street, address_unit, address_city, address_postal_code")
          .ilike("email", normEmail);

        if (existingLeads && existingLeads.some(matchesAddress)) {
          return NextResponse.json(
            { success: false, error: "You already have a submission for this address. Please contact us if you need to make changes." },
            { status: 409 }
          );
        }
      }

      // b) name-or-alias-based duplicate: same person under a former name + same address
      if (normFirst || normLast) {
        const aliasMatch = await findClientByName(first_name ?? "", last_name ?? "");
        if (aliasMatch) {
          const { data: clientLeads } = await supabaseAdmin
            .from("leads")
            .select("id, address_street, address_unit, address_city, address_postal_code")
            .eq("client_id", aliasMatch.id);
          if (clientLeads && clientLeads.some(matchesAddress)) {
            return NextResponse.json(
              { success: false, error: "We already have a submission for this address under your name. Please contact us if you need to make changes." },
              { status: 409 }
            );
          }
        }
      }
    }

    // ── Block intake for an address that already has a converted deal ──
    // Once a deal exists for an address, a DIFFERENT person submitting an
    // intake for the same address must NOT auto-join the deal as a
    // co-purchaser/co-seller. Co-purchasers/co-sellers can only be added by an
    // admin from the admin panel. So we reject the submission outright instead
    // of creating the lead. (Same-person resubmissions are already caught by
    // the email/name duplicate checks above.)
    if (normStreet && normCity && normEmail) {
      // Fetch all converted primary leads at this city by a DIFFERENT person,
      // then compare street/unit/city/postal in JS (trim + lowercase) so
      // DB-side whitespace/casing differences don't cause a miss.
      const { data: convertedMatches } = await supabaseAdmin
        .from("leads")
        .select("id, email, address_street, address_unit, address_city, address_postal_code")
        .eq("status", "Converted")
        .neq("email", normEmail)
        .is("parent_lead_id", null)
        .ilike("address_city", normCity);

      const hasConvertedDeal = (convertedMatches ?? []).some(matchesAddress);

      console.log(
        `[Intake] Converted-deal block check: street="${normStreet}" city="${normCity}" unit="${normUnit}" postal="${normPostal}" email="${normEmail}" → candidates=${convertedMatches?.length ?? 0}, blocked=${hasConvertedDeal}`
      );

      if (hasConvertedDeal) {
        return NextResponse.json(
          {
            success: false,
            error:
              "A deal already exists for this property. A co-purchaser or co-seller can only be added by an admin. Please contact us to be added to this deal.",
          },
          { status: 409 }
        );
      }
    }

    // ── 1. Resolve client ID ──────────────────────────────────
    let clientId: string | null = null;
    let isLoggedIn = false;

    try {
      const authClient = await getAuthClient();
      isLoggedIn = !!authClient;
      clientId = authClient?.id ?? null;

      if (!clientId && email) {
        const { data: clientsByEmail } = await supabaseAdmin
          .from("clients")
          .select("id, merged_into_client_id")
          .ilike("email", email.toLowerCase().trim())
          .order("created_at", { ascending: false })
          .limit(1);
        const hit = clientsByEmail?.[0];
        if (hit?.merged_into_client_id) {
          const primary = await followMergedClient(hit.merged_into_client_id);
          clientId = primary?.id ?? null;
        } else {
          clientId = hit?.id ?? null;
        }
      }

      if (!clientId) {
        const authUser = await getAuthUser();
        if (authUser?.id) {
          isLoggedIn = true;
          const { data: clientsByAuth } = await supabaseAdmin
            .from("clients")
            .select("id")
            .eq("auth_user_id", authUser.id)
            .order("created_at", { ascending: false })
            .limit(1);
          clientId = clientsByAuth?.[0]?.id ?? null;
        }
      }

      // Fall back to name (primary or alias) so a returning person under a
      // former name is matched to the same clients.id.
      if (!clientId && (first_name || last_name)) {
        const byName = await findClientByName(first_name ?? "", last_name ?? "");
        if (byName) {
          clientId = byName.merged_into_client_id
            ? (await followMergedClient(byName.merged_into_client_id))?.id ?? byName.id
            : byName.id;
        }
      }
    } catch (e) {
      console.warn("Client fetch failed:", e);
    }

    // ── 1b. Name-identity validation ──────────────────────────
    // Logged-in users: name MUST match their account's current name or aliases.
    // Mismatch is hard-blocked — they should rename via /profile first if their
    // name has changed.
    // Anonymous users: name mismatch falls back to creating a separate clients
    // row so two real people sharing an email don't get merged.
    if (clientId && (first_name || last_name)) {
      const { data: resolvedClient } = await supabaseAdmin
        .from("clients")
        .select("id, first_name, last_name, name_aliases")
        .eq("id", clientId)
        .maybeSingle();

      if (
        resolvedClient &&
        !nameMatchesClient(resolvedClient, first_name ?? "", last_name ?? "")
      ) {
        if (isLoggedIn) {
          return NextResponse.json(
            {
              success: false,
              error:
                "The name you entered does not match your account. Please use your registered name or update your profile.",
            },
            { status: 400 }
          );
        }

        // Anonymous: split into a fresh clients row.
        const { data: newClient, error: newClientErr } = await supabaseAdmin
          .from("clients")
          .insert({
            email: email ?? null,
            first_name: first_name ?? "",
            last_name: last_name ?? "",
            phone: phone ?? null,
          })
          .select("id")
          .single();
        if (!newClientErr && newClient) {
          console.log(
            `[Intake] Email ${email} matched client ${clientId} (${resolvedClient.first_name} ${resolvedClient.last_name}) but submitted name was "${first_name} ${last_name}" — created separate client ${newClient.id}`
          );
          clientId = newClient.id;
        } else {
          console.warn("[Intake] Failed to split client on name mismatch:", newClientErr?.message);
          clientId = null;
        }
      }
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
        selling_price: cleanSellingPrice,
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
        aps_signed: apsSignedAggregate,
        aps_signed_purchase: apsPurchase,
        aps_signed_sale: apsSale,
        co_persons: co_persons ?? [],
        upload_mode: uploadMode,
        upload_consent_at: null,
        upload_consent_uploader_lead_id: null,
        referral_source: referral_source || null,
        client_id: clientId,
      })
      .select()
      .single();

    if (error) {
      console.error("Insert error:", error);
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    // Track every lead row created in this intake so each one triggers an
    // admin notification, regardless of path (primary, co-person, sale-split).
    const notifyLeadIds: string[] = [lead.id];

    // ── 3. Create co-person leads ─────────────────────────────
    const coPersonLeadIds: string[] = [];
    const coPersonLeadIdByFormId = new Map<string, string>();

    if (hasCoPersons) {
      for (const cp of co_persons) {
        try {
          const [cpFirst, ...cpRest] = (cp.fullName ?? "").split(" ");
          const cpLast = cpRest.join(" ");

          // role is "purchaser" | "seller" from the intake form's
          // Co-Purchaser / Co-Seller stacks. Stored so the admin panel can
          // label each co-person correctly (esp. for Purchase & Sale leads).
          const cpRole =
            cp.role === "purchaser" || cp.role === "seller" ? cp.role : null;

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
              selling_price: cleanSellingPrice,
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
              aps_signed: apsSignedAggregate,
              aps_signed_purchase: apsPurchase,
              aps_signed_sale: apsSale,
              co_persons: [],
              co_person_role: cpRole,
              parent_lead_id: lead.id,
              client_id: clientId,
            })
            .select("id")
            .single();

          if (cpError) {
            console.warn(`[Intake] Co-person lead insert failed for ${cp.email}:`, cpError.message);
          } else if (cpLead) {
            coPersonLeadIds.push(cpLead.id);
            if (cp.id) coPersonLeadIdByFormId.set(cp.id, cpLead.id);
            notifyLeadIds.push(cpLead.id);
          }
        } catch (cpErr) {
          console.warn("[Intake] Co-person lead creation failed (non-blocking):", cpErr);
        }
      }
    }

    // ── 4. Address match detection (co-purchaser) ─────────────
    // Flags when a DIFFERENT person (different email) submits for the same
    // address as an existing, NOT-yet-converted lead, so an admin can review
    // and link them from the admin panel. Addresses that already have a
    // converted deal are rejected earlier (before the lead is created), so we
    // never auto-link or auto-convert a co-purchaser/co-seller here — that can
    // only be done by an admin.
    if (uploadMode === "co") {
      const uploaderLeadId = coPersonLeadIdByFormId.get(document_uploader_co_person_id);
      if (!uploaderLeadId) {
        return NextResponse.json(
          { success: false, error: "Could not save the selected document uploader." },
          { status: 500 }
        );
      }

      const { error: uploadChoiceErr } = await supabaseAdmin
        .from("leads")
        .update({
          upload_consent_at: new Date().toISOString(),
          upload_consent_uploader_lead_id: uploaderLeadId,
        })
        .eq("id", lead.id);

      if (uploadChoiceErr) {
        console.error("[Intake] Document uploader update failed:", uploadChoiceErr);
        return NextResponse.json(
          { success: false, error: uploadChoiceErr.message },
          { status: 500 }
        );
      }
    }

    let addressMatch = false;
    const autoConverted = false;

    try {
      if (normStreet && normCity && normPostal) {
        const excludeIds = [lead.id, ...coPersonLeadIds];
        const { data: matchingLeads } = await supabaseAdmin
          .from("leads")
          .select("id, status, address_unit, address_postal_code")
          .not("id", "in", `(${excludeIds.join(",")})`)
          .neq("email", normEmail)
          .is("parent_lead_id", null)
          .ilike("address_street", normStreet)
          .ilike("address_city", normCity);

        if (matchingLeads && matchingLeads.length > 0) {
          const matched = matchingLeads.find((ml) => {
            const mlUnit = (ml.address_unit ?? "").trim().toLowerCase().replace(/\s/g, "");
            const mlPostal = (ml.address_postal_code ?? "").trim().toLowerCase().replace(/\s/g, "");
            return mlUnit === normUnit && mlPostal === normPostal;
          });

          if (matched) {
            addressMatch = true;

            // Flag for admin review. A converted match would have been rejected
            // before this lead was inserted, so this is always a not-yet-converted
            // match that an admin can choose to link as a co-purchaser/co-seller.
            await supabaseAdmin
              .from("leads")
              .update({
                address_match_flag: { matched_lead_id: matched.id, status: "pending" },
              })
              .eq("id", lead.id);
          }
        }
      }
    } catch (matchErr) {
      console.warn("[Intake] Address match check failed (non-blocking):", matchErr);
    }

    // ── 5. Trigger welcome email ───────────────────────────────
    // Send the welcome email for every intake completion, whether or not the
    // address-match auto-conversion ran. This used to be skipped when
    // autoConverted was true (on the assumption convertSingleLead's invite
    // email replaced it), but that left auto-joined clients with no welcome —
    // and, when the invite failed, with no email at all. The login and
    // welcome-email fallbacks filter on welcome_email_sent, so sending here
    // won't double-send.
    try {
      await sendWelcomeEmail(lead.id);
      await Promise.all(
        coPersonLeadIds.map((cpLeadId) => sendWelcomeEmail(cpLeadId))
      );
    } catch (err) {
      console.error("[Intake] Welcome email failed:", err);
    }

    // ── 6. Notify iClosed team for every lead created in this intake ───
    // Awaited so a serverless instance termination after the response can't
    // silently drop the notification. Each send is wrapped individually so
    // one failure doesn't skip the others.
    await Promise.all(
      notifyLeadIds.map((id) =>
        sendLeadNotificationEmail(id).catch((err) =>
          console.error("[Intake] Team notification failed for lead", id, err)
        )
      )
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

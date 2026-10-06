import supabaseAdmin from "@/lib/supabaseAdmin";
import { getAuthClient, getAuthUser } from "@/lib/getAuthClient";
import { sendWelcomeEmail } from "@/lib/sendWelcomeEmail";
import { sendLeadNotificationEmail } from "@/lib/sendLeadNotificationEmail";
import { sendQuoteEmail } from "@/lib/sendQuoteEmail";
import { notifyNewLead } from "@/lib/notifyNewLead";
import { findClientByName, followMergedClient, nameMatchesClient } from "@/lib/clientNames";
import { findOrCreatePartner, partnerTypeFromSource } from "@/lib/resolvePartner";
import { normalizeEmailForStorage } from "@/lib/normalizeEmail";
import { normalizeAmount } from "@/lib/apsExtraction";
import { parsePropertyType } from "@/lib/propertyType";
import { NextResponse } from "next/server";
import {
  normalizePostalCode,
  validateCity,
  validatePostalCode,
} from "@/lib/addressValidation";
// This route can reach the email transport, and the SMTP provider uses
// nodemailer — which needs raw TCP and CANNOT run on the Edge runtime.
// Resend never exposed this because it is an HTTPS fetch client.
export const runtime = "nodejs";

// An SMTP attempt can take ~40s (connect+greeting+socket) and transport allows two.
export const maxDuration = 60;


export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      first_name,
      last_name,
      email: rawEmail,
      phone,
      service,
      sub_service,
      price,
      selling_price,
      deposit_amount,
      selling_deposit_amount,
      building_type,
      closing_date,
      selling_closing_date,
      address_street,
      address_unit,
      address_city,
      address_postal_code: rawAddressPostalCode,
      address_province,
      selling_address_street,
      selling_address_unit,
      selling_address_city,
      selling_address_postal_code: rawSellingAddressPostalCode,
      selling_address_province,
      aps_signed,
      aps_signed_purchase,
      aps_signed_sale,
      aps_extraction,
      co_persons,
      document_upload_mode,
      document_uploader_co_person_id,
      referral_source,
      partner_id,
      referral_agent_name,
      referral_agent_company,
      referral_agent_email: rawReferralAgentEmail,
      referral_agent_phone,
    } = body;

    // Addresses are cleaned ONCE, here, so every use below — the duplicate
    // checks, the client/lead inserts, the welcome email — sees the same value.
    //
    // Storing the raw typed value is what broke the agent signup notification:
    // Supabase Auth trims the address it registers, so a pasted trailing space
    // left the lead/client row unfindable from the login identity, the admin
    // never promoted the deal off "Inactive", and the referring agent was never
    // told their client had signed up. See lib/normalizeEmail.ts.
    const email = normalizeEmailForStorage(rawEmail);
    const referral_agent_email = normalizeEmailForStorage(rawReferralAgentEmail);

    // Postal codes are stored uppercase everywhere.
    const address_postal_code =
      normalizePostalCode(rawAddressPostalCode).trim() || null;
    const selling_address_postal_code =
      normalizePostalCode(rawSellingAddressPostalCode).trim() || null;

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
    // Deposit is optional on the intake form — an empty string stays null so it
    // never lands in the DB as 0 and gets mistaken for "no deposit required".
    const cleanAmount = (value: unknown) => {
      const digits = value ? String(value).replace(/[^0-9.]/g, "") : "";
      return digits ? digits : null;
    };

    // Closing date is optional and arrives as an ISO "YYYY-MM-DD" string from
    // the date input (or from an APS read, normalized to the same shape).
    // Anything that isn't a real calendar date is dropped rather than rejected
    // — a garbled date must never cost the client their whole submission.
    const cleanClosingDate = (value: unknown): string | null => {
      if (typeof value !== "string") return null;
      const trimmed = value.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
      const parsed = new Date(`${trimmed}T00:00:00Z`);
      if (Number.isNaN(parsed.getTime())) return null;
      // Round-trip guards against "2026-02-31" style overflow, which Date
      // silently rolls forward into March.
      if (parsed.toISOString().slice(0, 10) !== trimmed) return null;
      return trimmed;
    };
    const closingDate = cleanClosingDate(closing_date);
    const sellingClosingDate =
      sub_service === "both" ? cleanClosingDate(selling_closing_date) : null;

    // Audit trail of what the APS reader returned, kept next to what the client
    // accepted. Stored as-is; the deposit is taken from it, below.
    const apsExtraction =
      aps_extraction &&
      typeof aps_extraction === "object" &&
      !Array.isArray(aps_extraction) &&
      Object.keys(aps_extraction).length > 0
        ? aps_extraction
        : null;

    // Deposit: the APS value, else the form's.
    const apsDeposit = (side: "purchase" | "sale") =>
      normalizeAmount(apsExtraction?.[side]?.result?.deposit?.value, { min: 1 });
    const cleanDeposit =
      apsDeposit(sub_service === "selling" ? "sale" : "purchase") ?? cleanAmount(deposit_amount);
    const cleanSellingDeposit =
      sub_service === "both" ? apsDeposit("sale") ?? cleanAmount(selling_deposit_amount) : null;

    // Purchase side only.
    const propertyType = sub_service === "selling" ? null : parsePropertyType(building_type);

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

    const addressChecks: Array<[string, unknown, (v: string) => string | null]> = [
      ["City", address_city, validateCity],
      ["Selling city", selling_address_city, validateCity],
      ["Postal code", address_postal_code, validatePostalCode],
      ["Selling postal code", selling_address_postal_code, validatePostalCode],
    ];
    for (const [label, value, validator] of addressChecks) {
      const trimmed = typeof value === "string" ? value.trim() : "";
      if (!trimmed) continue;
      const fieldError = validator(trimmed);
      if (fieldError) {
        return NextResponse.json(
          { success: false, error: `${label}: ${fieldError}` },
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

    // ── 1b. Name-identity ─────────────────────────────────────
    // The name on an intake is the name of the person the FILE is for, which is
    // not necessarily the person filling the form in. The intake takes its
    // primary contact from the first purchaser named on the uploaded agreement,
    // so a co-purchaser, a spouse or a family member may well be the one at the
    // keyboard — signed in under their own account.
    //
    // A submitted name that doesn't match the client we resolved therefore is
    // not an error to reject. It means we resolved the WRONG client, and the
    // lead belongs to whoever the submitted name identifies: an existing
    // clients row where there is one, a fresh row where there isn't.
    //
    // This used to hard-block a signed-in submitter ("The name you entered does
    // not match your account"), which made it impossible to open a file for
    // anybody but yourself — and impossible to submit at all after a name
    // change until the account had been renamed.
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
        const wrongClientId = clientId;

        // Does the submitted name already belong to somebody? Asked before
        // inserting, or every intake opened for the same person would leave
        // behind another duplicate clients row. The resolution above never got
        // this far: it stops at the first match, which was the wrong one.
        const byName = await findClientByName(first_name ?? "", last_name ?? "");
        const existing = byName?.merged_into_client_id
          ? await followMergedClient(byName.merged_into_client_id)
          : byName;

        if (existing) {
          clientId = existing.id;
        } else {
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
            clientId = newClient.id;
          } else {
            console.warn(
              "[Intake] Failed to split client on name mismatch:",
              newClientErr?.message
            );
            clientId = null;
          }
        }

        // Logged either way, because the one case this can't tell apart is a
        // signed-in client whose own name simply changed — which looks exactly
        // like one opening a file for someone else. If the two rows turn out to
        // be the same person, an admin merges them.
        console.log(
          `[Intake] Submitted name "${first_name} ${last_name}" does not match client ` +
            `${wrongClientId} (${resolvedClient.first_name} ${resolvedClient.last_name})` +
            `${isLoggedIn ? " — signed-in submitter" : ""} → attached to ${clientId ?? "no client"}`
        );
      }
    }

    // Resolve/attach a partner for the keyed-in ("no code") agent/broker path so
    // they land in the Partners table and accrue client counts. A partner
    // resolved from an applied code always wins; only fall back to
    // find-or-create for manual entries.
    let resolvedPartnerId: string | null = partner_id || null;
    if (!resolvedPartnerId && referral_agent_email?.trim()) {
      const partnerType = partnerTypeFromSource(referral_source);
      if (partnerType) {
        try {
          const partner = await findOrCreatePartner(supabaseAdmin, {
            name: referral_agent_name,
            company: referral_agent_company,
            email: referral_agent_email,
            phone: referral_agent_phone,
            type: partnerType,
          });
          resolvedPartnerId = partner?.id ?? null;
        } catch (e) {
          // Never block intake on partner resolution — fall back to free-text only.
          console.error("Partner find-or-create failed:", e);
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
        // Optional deposit. Only spread the keys when a deposit was actually
        // entered so an intake without one never references the column — keeps
        // intake working before the deposit migration is applied.
        ...(cleanDeposit ? { deposit_amount: cleanDeposit } : {}),
        ...(cleanSellingDeposit ? { selling_deposit_amount: cleanSellingDeposit } : {}),
        ...(propertyType ? { building_type: propertyType } : {}),
        // Optional closing date. Same conditional-spread convention as the
        // deposit above, so an intake without one never references the column
        // and keeps working before the migration is applied.
        ...(closingDate ? { closing_date: closingDate } : {}),
        ...(sellingClosingDate ? { selling_closing_date: sellingClosingDate } : {}),
        ...(apsExtraction ? { aps_extraction: apsExtraction } : {}),
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
        // Referral attribution — the partner resolved from the applied referral
        // code, or find-or-created from a keyed-in agent. Only spread the key
        // when the intake actually carries a referral so a non-referred intake
        // never references the column (keeps intake working even before the
        // partner_id migration is applied).
        // convertLead() copies these onto the deal on conversion.
        ...(resolvedPartnerId ? { partner_id: resolvedPartnerId } : {}),
        // Manual "no code" referral — an off-system agent/broker the client named.
        ...(referral_agent_name ? { referral_agent_name } : {}),
        ...(referral_agent_company ? { referral_agent_company } : {}),
        ...(referral_agent_email ? { referral_agent_email } : {}),
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
              // Same cleaning as the primary lead — a co-purchaser signs in
              // under their own login, so an untrimmed address strands their
              // activation (and the agent notification) exactly the same way.
              email: normalizeEmailForStorage(cp.email),
              phone: cp.phone || null,
              service,
              sub_service: service === "closing" ? sub_service : null,
              lead_type,
              price: cleanPrice,
              selling_price: cleanSellingPrice,
              ...(cleanDeposit ? { deposit_amount: cleanDeposit } : {}),
              ...(cleanSellingDeposit ? { selling_deposit_amount: cleanSellingDeposit } : {}),
              ...(propertyType ? { building_type: propertyType } : {}),
              ...(closingDate ? { closing_date: closingDate } : {}),
              ...(sellingClosingDate ? { selling_closing_date: sellingClosingDate } : {}),
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
              // Inherit the primary's firm rather than taking the column
              // default. Today intake is one shared URL, so both come out the
              // same either way — but when intake URLs are split per firm the
              // primary will arrive as iClosed LLP and its co-persons must
              // follow it, not silently fall back to Nava Wilson.
              firm_key: lead.firm_key ?? undefined,
              client_id: clientId,
            })
            .select("id")
            .single();

          if (cpError) {
            console.warn(`[Intake] Co-person lead insert failed for ${cp.email}:`, cpError.message);
          } else if (cpLead) {
            coPersonLeadIds.push(cpLead.id);
            if (cp.id) coPersonLeadIdByFormId.set(cp.id, cpLead.id);
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

    // Quote to every buyer or seller, each with their own retainer.
    await Promise.all([lead.id, ...coPersonLeadIds].map((id) => sendQuoteEmail(id)));

    // ── 6. Notify the iClosed team that a lead has arrived ─────────────
    // ONE alert per intake, for the primary lead — by email to the back office
    // and as a row in the admin's in-app feed (which also lights the yellow dot
    // on the sidebar's Leads button).
    //
    // This used to loop over every lead row created here and email once each.
    // The copy no longer carries per-person detail, so that would put the same
    // message in the inbox two or three times for a couple buying together —
    // the co-purchasers are part of the same arriving file, and staff open the
    // file, not the person.
    //
    // Awaited so a serverless instance termination after the response can't
    // silently drop them, and each is wrapped on its own so a failing email
    // doesn't cost us the in-app alert (or the other way round). Neither can
    // fail the intake: the lead is already saved.
    await Promise.all([
      sendLeadNotificationEmail(lead.id).catch((err) =>
        console.error("[Intake] Team notification email failed for lead", lead.id, err)
      ),
      notifyNewLead(lead.id).catch((err) =>
        console.error("[Intake] In-app new-lead alert failed for lead", lead.id, err)
      ),
    ]);

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

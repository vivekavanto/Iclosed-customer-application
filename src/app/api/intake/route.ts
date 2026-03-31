import supabaseAdmin from "@/lib/supabaseAdmin";
import { getAuthClient } from "@/lib/getAuthClient";
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

    // Strip currency formatting from price (e.g. "$6,567,876" → "6567876")
    const cleanPrice = price ? String(price).replace(/[^0-9.]/g, "") : null;

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

    // ── Insert Lead ───────────────────────────────────────────
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
      })
      .select()
      .single();

    if (error) {
      console.error("Insert error:", error);
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    // ── Address duplicate detection (co-purchaser flag) ─────
    // Only flags when a DIFFERENT person (different email) submits for the same address.
    // Same person re-submitting is ignored.
    let addressMatch = false;
    try {
      const normStreet = (address_street ?? "").trim().toLowerCase();
      const normCity = (address_city ?? "").trim().toLowerCase();
      const normPostal = (address_postal_code ?? "").trim().toLowerCase().replace(/\s/g, "");
      const normEmail = (email ?? "").trim().toLowerCase();

      if (normStreet && normCity && normPostal) {
        const { data: matchingLeads } = await supabaseAdmin
          .from("leads")
          .select("id, address_postal_code")
          .neq("id", lead.id)
          .neq("email", normEmail)  // Exclude same email (same person re-submitting)
          .ilike("address_street", normStreet)
          .ilike("address_city", normCity);

        if (matchingLeads && matchingLeads.length > 0) {
          // Find one with matching postal code (normalize by removing spaces)
          const matchedLead = matchingLeads.find((ml) => {
            const mlPostal = (ml.address_postal_code ?? "").trim().toLowerCase().replace(/\s/g, "");
            return mlPostal === normPostal;
          });

          if (matchedLead) {
            await supabaseAdmin
              .from("leads")
              .update({
                address_match_flag: {
                  matched_lead_id: matchedLead.id,
                  status: "pending",
                },
              })
              .eq("id", lead.id);
            addressMatch = true;
          }
        }
      }
    } catch (matchErr) {
      // Non-blocking — intake still succeeds even if matching fails
      console.warn("[Intake] Address match check failed (non-blocking):", matchErr);
    }

    // Trigger welcome email via admin portal (fire and forget)
    const adminUrl = process.env.NEXT_PUBLIC_ADMIN_PORTAL_URL || "https://iclosed-admin-panel.vercel.app";
    fetch(`${adminUrl}/api/webhooks/new-lead`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead_id: lead.id }),
    }).catch((err) => console.error("[Intake] Welcome email trigger failed:", err));

    // ── Auto-link to client if user is logged in ──────────────
    // When an authenticated user fills the intake form, immediately create
    // a pending deal so it shows up in their dashboard without admin action.
    let autoLinked = false;
    try {
      // Try session-based auth first
      const authClient = await getAuthClient();

      // Fallback: match by email (covers cases where session not passed from client)
      let clientId: string | null = authClient?.id ?? null;
      if (!clientId && email) {
        const { data: clientByEmail } = await supabaseAdmin
          .from("clients")
          .select("id")
          .eq("email", email.toLowerCase().trim())
          .maybeSingle();
        clientId = clientByEmail?.id ?? null;
      }

      if (clientId) {
        // Guard: skip if a deal already exists for this lead (prevents duplicates)
        const { data: existingDeal } = await supabaseAdmin
          .from("deals")
          .select("id")
          .eq("lead_id", lead.id)
          .maybeSingle();

        if (!existingDeal) {
          const typePrefix = lead_type === "Purchase" ? "P"
            : lead_type === "Sale" ? "S"
            : lead_type === "Purchase & Sale" ? "PS"
            : lead_type === "Refinance" ? "R"
            : lead_type === "Condo" ? "C"
            : "L";

          const year = new Date().getFullYear().toString().slice(-2);
          const shortId = lead.id.replace(/-/g, "").slice(0, 6).toUpperCase();
          const file_number = `${year}${typePrefix}-${shortId}`;

          await supabaseAdmin
            .from("deals")
            .insert({
              lead_id: lead.id,
              client_id: clientId,
              file_number,
              type: lead_type,
              status: "Pending",
              property_address: address_street || null,
              price: cleanPrice ? parseFloat(cleanPrice) : null,
            });
        }

        autoLinked = true;
      }
    } catch (linkErr) {
      // Non-blocking — intake still succeeds even if auto-link fails
      console.warn("Auto-link to client failed (non-blocking):", linkErr);
    }

    return NextResponse.json({
      success: true,
      lead_id: lead.id,
      auto_linked: autoLinked,
      address_match: addressMatch,
    });

  } catch (err) {
    console.error("Server error:", err);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}

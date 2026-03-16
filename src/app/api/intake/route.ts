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
    } = body;

    // ── Lead type ─────────────────────────────────────────────
    let lead_type = null;
    if (service === "closing") {
      if (sub_service === "buying")       lead_type = "Purchase";
      else if (sub_service === "selling") lead_type = "Sale";
      else if (sub_service === "both")    lead_type = "Purchase & Sale";
    }
    if (service === "refinance") lead_type = "Refinance";
    if (service === "condo")     lead_type = "Condo";

    // Strip currency formatting from price (e.g. "$6,567,876" → "6567876")
    const cleanPrice = price ? String(price).replace(/[^0-9.]/g, "") : null;

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
      })
      .select()
      .single();

    if (error) {
      console.error("Insert error:", error);
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

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
    });

  } catch (err) {
    console.error("Server error:", err);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}

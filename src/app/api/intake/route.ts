import supabaseAdmin from "@/lib/supabaseAdmin";
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
    } = body;

    // 🔹 Lead type logic
    let lead_type = null;
    if (service === "closing") {
      if (sub_service === "buying") {
        lead_type = "Purchase";
      }
      else if (sub_service === "selling") {
        lead_type = "Sale";
      }
      else if (sub_service === "both") {
        lead_type = "Purchase & Sale"; 
      }

    }

    if (service === "refinance") {
      lead_type = "Refinance";
    }
    if (service === "condo") {
      lead_type = "Condo";
    }
    
    //  Insert Lead
    const { data, error } = await supabaseAdmin
      .from("leads")
      .insert({
        first_name,
        last_name,
        email,
        phone,
        service,
        sub_service: service === "closing" ? sub_service : null,
        lead_type,
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
      })
      .select()
      .single();

    if (error) {
      console.error("Insert error:", error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      lead_id: data.id,
    });

  } catch (err) {
    console.error("Server error:", err);
    return NextResponse.json(
      { success: false, error: "Server error" },
      { status: 500 }
    );
  }
}
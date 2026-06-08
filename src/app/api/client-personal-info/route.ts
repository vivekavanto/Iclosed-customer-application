import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { getAuthClient } from "@/lib/getAuthClient";

/**
 * GET /api/client-personal-info
 *
 * Returns the authenticated customer's reusable personal information from the
 * `clients` table so the Personal Information drawer can pre-fill it when the
 * customer starts a NEW deal (they shouldn't re-enter what we already have).
 *
 * Only the fields actually stored on `clients` are returned:
 *   phone, marital_status, citizenship_status, occupation, employer_phone.
 *
 * Address is intentionally NOT returned: `clients` stores no home address, and
 * the lead's address is the *property* address, not the customer's home address
 * (the drawer leaves the address fields blank on purpose).
 */
export async function GET() {
  try {
    const client = await getAuthClient();
    if (!client) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 },
      );
    }

    const { data, error } = await supabaseAdmin
      .from("clients")
      .select("phone, marital_status, citizenship_status, occupation, employer_phone")
      .eq("id", client.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 },
      );
    }

    return NextResponse.json({ success: true, personalInfo: data ?? null });
  } catch (err) {
    console.error("GET /api/client-personal-info error:", err);
    return NextResponse.json(
      { success: false, error: "Server error" },
      { status: 500 },
    );
  }
}

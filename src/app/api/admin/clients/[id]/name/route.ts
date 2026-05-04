import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { renameClient } from "@/lib/clientNames";

/**
 * PATCH /api/admin/clients/:id/name
 * Admin-driven name update. Old name is archived as an alias.
 *
 * Body: { first_name: string, last_name: string, admin_user_id?: string, reason?: string }
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ success: false, error: "Missing client id" }, { status: 400 });
  }

  let body: { first_name?: unknown; last_name?: unknown; admin_user_id?: unknown; reason?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const first_name = typeof body.first_name === "string" ? body.first_name : "";
  const last_name = typeof body.last_name === "string" ? body.last_name : "";
  const adminUserId = typeof body.admin_user_id === "string" ? body.admin_user_id : "unknown";
  const reason = typeof body.reason === "string" ? body.reason : "admin_update";

  const result = await renameClient({
    clientId: id,
    newFirstName: first_name,
    newLastName: last_name,
    addedBy: `admin:${adminUserId}`,
    reason,
  });

  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
  }

  const { data: updated } = await supabaseAdmin
    .from("clients")
    .select("id, first_name, last_name, name_aliases")
    .eq("id", id)
    .maybeSingle();

  return NextResponse.json({ success: true, client: updated });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "PATCH, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

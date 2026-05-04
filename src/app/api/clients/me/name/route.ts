import { NextResponse } from "next/server";
import { getAuthClient } from "@/lib/getAuthClient";
import { renameClient } from "@/lib/clientNames";
import supabaseAdmin from "@/lib/supabaseAdmin";

/**
 * PATCH /api/clients/me/name
 * Self-service name update for the signed-in client.
 * Old name is auto-archived as an alias.
 *
 * Body: { first_name: string, last_name: string }
 */
export async function PATCH(req: Request) {
  const me = await getAuthClient();
  if (!me) {
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }

  let body: { first_name?: unknown; last_name?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const first_name = typeof body.first_name === "string" ? body.first_name : "";
  const last_name = typeof body.last_name === "string" ? body.last_name : "";

  if (!first_name.trim() && !last_name.trim()) {
    return NextResponse.json({ success: false, error: "Name cannot be empty" }, { status: 400 });
  }

  const result = await renameClient({
    clientId: me.id,
    newFirstName: first_name,
    newLastName: last_name,
    addedBy: "self",
    reason: "self_update",
  });

  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
  }

  const { data: updated } = await supabaseAdmin
    .from("clients")
    .select("id, first_name, last_name, name_aliases")
    .eq("id", me.id)
    .maybeSingle();

  return NextResponse.json({ success: true, client: updated });
}

export async function GET() {
  const me = await getAuthClient();
  if (!me) {
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }
  const { data } = await supabaseAdmin
    .from("clients")
    .select("id, first_name, last_name, name_aliases")
    .eq("id", me.id)
    .maybeSingle();
  return NextResponse.json({ success: true, client: data });
}

import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import {
  buildAliasEntry,
  dedupeAliases,
  followMergedClient,
  type NameAlias,
} from "@/lib/clientNames";

/**
 * POST /api/admin/clients/merge
 * Merges a secondary client record into a primary one.
 *
 * Effects:
 *  - Moves all leads + deals from secondary -> primary (re-points client_id).
 *  - Copies secondary's current name + name_aliases into primary's name_aliases.
 *  - Sets secondary.merged_into_client_id = primary.id (row stays for audit).
 *
 * Body: { primary_client_id: string, secondary_client_id: string, admin_user_id?: string }
 */
export async function POST(req: Request) {
  let body: { primary_client_id?: unknown; secondary_client_id?: unknown; admin_user_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const primaryId = typeof body.primary_client_id === "string" ? body.primary_client_id : "";
  const secondaryId = typeof body.secondary_client_id === "string" ? body.secondary_client_id : "";
  const adminUserId = typeof body.admin_user_id === "string" ? body.admin_user_id : "unknown";

  if (!primaryId || !secondaryId) {
    return NextResponse.json(
      { success: false, error: "primary_client_id and secondary_client_id are required" },
      { status: 400 }
    );
  }
  if (primaryId === secondaryId) {
    return NextResponse.json(
      { success: false, error: "Cannot merge a client into itself" },
      { status: 400 }
    );
  }

  const { data: primary } = await supabaseAdmin
    .from("clients")
    .select("id, first_name, last_name, name_aliases, merged_into_client_id")
    .eq("id", primaryId)
    .maybeSingle();
  const { data: secondary } = await supabaseAdmin
    .from("clients")
    .select("id, first_name, last_name, name_aliases, merged_into_client_id")
    .eq("id", secondaryId)
    .maybeSingle();

  if (!primary) {
    return NextResponse.json({ success: false, error: "Primary client not found" }, { status: 404 });
  }
  if (!secondary) {
    return NextResponse.json({ success: false, error: "Secondary client not found" }, { status: 404 });
  }
  if (primary.merged_into_client_id) {
    const realPrimary = await followMergedClient(primary.merged_into_client_id);
    return NextResponse.json(
      {
        success: false,
        error: `Primary client is already merged into ${realPrimary?.id ?? primary.merged_into_client_id}; merge into that instead.`,
      },
      { status: 409 }
    );
  }
  if (secondary.merged_into_client_id) {
    return NextResponse.json(
      { success: false, error: "Secondary client has already been merged" },
      { status: 409 }
    );
  }

  const existingAliases: NameAlias[] = Array.isArray(primary.name_aliases)
    ? (primary.name_aliases as NameAlias[])
    : [];
  const secondaryAliases: NameAlias[] = Array.isArray(secondary.name_aliases)
    ? (secondary.name_aliases as NameAlias[])
    : [];
  const secondaryPrimary = buildAliasEntry(
    secondary.first_name ?? "",
    secondary.last_name ?? "",
    `admin:${adminUserId}`,
    "merge"
  );
  const merged = dedupeAliases([
    ...existingAliases,
    ...(secondaryPrimary.first_name || secondaryPrimary.last_name ? [secondaryPrimary] : []),
    ...secondaryAliases.map((a) => ({ ...a, reason: a.reason ?? "merge" })),
  ]);

  // 1. Move leads
  const { error: leadsErr, count: leadsMoved } = await supabaseAdmin
    .from("leads")
    .update({ client_id: primaryId }, { count: "exact" })
    .eq("client_id", secondaryId);
  if (leadsErr) {
    return NextResponse.json({ success: false, error: `Failed to move leads: ${leadsErr.message}` }, { status: 500 });
  }

  // 2. Move deals
  const { error: dealsErr, count: dealsMoved } = await supabaseAdmin
    .from("deals")
    .update({ client_id: primaryId }, { count: "exact" })
    .eq("client_id", secondaryId);
  if (dealsErr) {
    return NextResponse.json({ success: false, error: `Failed to move deals: ${dealsErr.message}` }, { status: 500 });
  }

  // 3. Update primary aliases
  const { error: primaryUpdErr } = await supabaseAdmin
    .from("clients")
    .update({ name_aliases: merged })
    .eq("id", primaryId);
  if (primaryUpdErr) {
    return NextResponse.json({ success: false, error: `Failed to update primary aliases: ${primaryUpdErr.message}` }, { status: 500 });
  }

  // 4. Mark secondary merged
  const { error: secondaryUpdErr } = await supabaseAdmin
    .from("clients")
    .update({ merged_into_client_id: primaryId })
    .eq("id", secondaryId);
  if (secondaryUpdErr) {
    return NextResponse.json({ success: false, error: `Failed to mark secondary merged: ${secondaryUpdErr.message}` }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    primary_client_id: primaryId,
    secondary_client_id: secondaryId,
    leads_moved: leadsMoved ?? 0,
    deals_moved: dealsMoved ?? 0,
    aliases: merged,
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

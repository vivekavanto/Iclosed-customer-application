import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { getAuthClientDeals } from "@/lib/getAuthClient";

export const dynamic = "force-dynamic";

// Max task ids per request.
const MAX_TASK_IDS = 100;

// GET ?task_ids=a,b — uploaded files on completed tasks in the client's family.
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("task_ids") ?? "";
  const taskIds = [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))].slice(
    0,
    MAX_TASK_IDS,
  );
  if (taskIds.length === 0) {
    return NextResponse.json({ success: true, documents: {} });
  }

  const auth = await getAuthClientDeals();
  if (!auth?.client) {
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }

  const clientLeadIds = (auth.deals ?? [])
    .map((d) => d.lead_id)
    .filter((x): x is string => !!x);
  if (clientLeadIds.length === 0) {
    return NextResponse.json({ success: true, documents: {} });
  }

  // Every lead in the client's families.
  const { data: ownLeads } = await supabaseAdmin
    .from("leads")
    .select("id, parent_lead_id")
    .in("id", clientLeadIds);

  const rootIds = [...new Set((ownLeads ?? []).map((l) => l.parent_lead_id ?? l.id))];
  if (rootIds.length === 0) {
    return NextResponse.json({ success: true, documents: {} });
  }

  const { data: familyLeads } = await supabaseAdmin
    .from("leads")
    .select("id")
    .or(rootIds.map((r) => `id.eq.${r},parent_lead_id.eq.${r}`).join(","));
  const allowedLeadIds = new Set((familyLeads ?? []).map((l) => l.id as string));

  // Completed tasks only.
  const { data: tasks, error: tasksError } = await supabaseAdmin
    .from("tasks")
    .select("id, deal_id")
    .in("id", taskIds)
    .eq("is_deleted", false)
    .eq("completed", true);

  if (tasksError) {
    console.error("[completed-documents] tasks query failed:", tasksError.message);
    return NextResponse.json({ success: false, error: "Could not load documents" }, { status: 500 });
  }

  const dealIds = [...new Set((tasks ?? []).map((t) => t.deal_id as string).filter(Boolean))];
  if (dealIds.length === 0) {
    return NextResponse.json({ success: true, documents: {} });
  }

  const { data: deals } = await supabaseAdmin
    .from("deals")
    .select("id, lead_id")
    .in("id", dealIds);
  const allowedDealIds = new Set(
    (deals ?? []).filter((d) => d.lead_id && allowedLeadIds.has(d.lead_id)).map((d) => d.id as string),
  );

  const ownedTaskIds = (tasks ?? [])
    .filter((t) => allowedDealIds.has(t.deal_id as string))
    .map((t) => t.id as string);
  if (ownedTaskIds.length === 0) {
    return NextResponse.json({ success: true, documents: {} });
  }

  const { data: responses, error: respError } = await supabaseAdmin
    .from("task_responses")
    .select("id, task_id, field_label, file_name, file_url, submitted_at")
    .in("task_id", ownedTaskIds)
    .not("file_url", "is", null);

  if (respError) {
    console.error("[completed-documents] responses query failed:", respError.message);
    return NextResponse.json({ success: false, error: "Could not load documents" }, { status: 500 });
  }

  // Grouped by task, duplicate URLs dropped.
  const documents: Record<
    string,
    Array<{ id: string; label: string | null; file_name: string | null; file_url: string; uploaded_at: string | null }>
  > = {};
  for (const r of responses ?? []) {
    if (!r.file_url) continue;
    const list = (documents[r.task_id] ??= []);
    if (list.some((d) => d.file_url === r.file_url)) continue;
    list.push({
      id: r.id as string,
      label: (r.field_label as string | null) ?? null,
      file_name: (r.file_name as string | null) ?? null,
      file_url: r.file_url as string,
      uploaded_at: (r.submitted_at as string | null) ?? null,
    });
  }

  return NextResponse.json({ success: true, documents });
}

import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { getAuthClientDeals } from "@/lib/getAuthClient";
import { docTypeLabel } from "@/lib/docTypeLabel";

export const dynamic = "force-dynamic";

// Admin-only doc_types — proof_of_deposit excluded, client can upload that one too.
const ADMIN_ONLY_DOC_TYPES = new Set(["other", "final_report", "statement_of_account"]);
const GENERIC_LABEL_TYPES = new Set(["other", "document"]);

// GET /api/documents — family's documents, split into yours vs. iClosed's.
export async function GET() {
  const auth = await getAuthClientDeals();
  if (!auth) {
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }

  const ownLeadIds = [
    ...new Set((auth.deals ?? []).map((d) => d.lead_id).filter((x): x is string => !!x)),
  ];
  if (ownLeadIds.length === 0) {
    return NextResponse.json({ success: true, documents: [], otherDocuments: [] });
  }

  const { data: ownLeads } = await supabaseAdmin
    .from("leads")
    .select("id, parent_lead_id")
    .in("id", ownLeadIds);

  const rootIds = [...new Set((ownLeads ?? []).map((l) => l.parent_lead_id ?? l.id))];
  if (rootIds.length === 0) {
    return NextResponse.json({ success: true, documents: [], otherDocuments: [] });
  }

  const orFilter = rootIds.map((r) => `id.eq.${r},parent_lead_id.eq.${r}`).join(",");
  const { data: familyLeads } = await supabaseAdmin
    .from("leads")
    .select("id")
    .or(orFilter);

  const leadIds = (familyLeads ?? []).map((l) => l.id as string);
  if (leadIds.length === 0) {
    return NextResponse.json({ success: true, documents: [], otherDocuments: [] });
  }

  const { data: docs, error } = await supabaseAdmin
    .from("lead_corporate_docs")
    .select("id, lead_id, doc_type, custom_type, file_name, file_url, file_size, created_at")
    .in("lead_id", leadIds)
    .eq("hidden_from_client", false)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[GET /api/documents] query failed:", error.message);
    return NextResponse.json({ success: false, error: "Could not load documents" }, { status: 500 });
  }

  // Free-form buckets label by filename; structured types label by category.
  function labelFor(d: { doc_type: string | null; custom_type: string | null; file_name: string | null }): string {
    if (d.custom_type) return d.custom_type;
    if (d.doc_type && GENERIC_LABEL_TYPES.has(d.doc_type)) {
      return d.file_name || docTypeLabel(d.doc_type) || "Document";
    }
    return docTypeLabel(d.doc_type) || d.file_name || "Document";
  }

  const allDocs = (docs ?? [])
    .filter((d) => d.file_url)
    .map((d) => ({
      id: d.id as string,
      lead_id: d.lead_id as string,
      doc_type: d.doc_type as string | null,
      label: labelFor(d as { doc_type: string | null; custom_type: string | null; file_name: string | null }),
      file_name: d.file_name as string | null,
      file_url: d.file_url as string,
      file_size: d.file_size as number | null,
      created_at: d.created_at as string | null,
    }));

  const documents = allDocs.filter((d) => !d.doc_type || !ADMIN_ONLY_DOC_TYPES.has(d.doc_type));
  const otherDocuments = allDocs.filter((d) => d.doc_type && ADMIN_ONLY_DOC_TYPES.has(d.doc_type));

  return NextResponse.json({ success: true, documents, otherDocuments });
}

import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { getAuthClientDeals } from "@/lib/getAuthClient";
import { docTypeLabel } from "@/lib/docTypeLabel";

export const dynamic = "force-dynamic";

interface Party {
  lead_id: string;
  first_name: string;
  last_name: string;
  role: string;
}

// doc_type="other" is written ONLY by admin's OtherDocuments.tsx (deal-level, not per-party); "document" is DynamicTaskDrawer's client-upload fallback, so it stays with the client's own documents.
const ADMIN_OTHER_DOC_TYPE = "other";
const GENERIC_LABEL_TYPES = new Set(["other", "document"]);

// GET /api/documents — every document for the client's family, split into `documents` (per-party) and `otherDocuments` (admin's deal-level bucket). Requires lead_corporate_docs.hidden_from_client (see iclosed-admin migrations/2026-09-17-hidden-from-client-lead-corporate-docs.sql).
export async function GET() {
  const auth = await getAuthClientDeals();
  if (!auth) {
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }

  const ownLeadIds = [
    ...new Set((auth.deals ?? []).map((d) => d.lead_id).filter((x): x is string => !!x)),
  ];
  if (ownLeadIds.length === 0) {
    return NextResponse.json({ success: true, parties: [], documents: [], otherDocuments: [] });
  }

  const { data: ownLeads } = await supabaseAdmin
    .from("leads")
    .select("id, parent_lead_id")
    .in("id", ownLeadIds);

  const rootIds = [...new Set((ownLeads ?? []).map((l) => l.parent_lead_id ?? l.id))];
  if (rootIds.length === 0) {
    return NextResponse.json({ success: true, parties: [], documents: [], otherDocuments: [] });
  }

  const orFilter = rootIds.map((r) => `id.eq.${r},parent_lead_id.eq.${r}`).join(",");
  const { data: familyLeads } = await supabaseAdmin
    .from("leads")
    .select("id, first_name, last_name, parent_lead_id, co_person_role")
    .or(orFilter);

  const parties: Party[] = (familyLeads ?? []).map((l) => ({
    lead_id: l.id as string,
    first_name: (l.first_name as string) ?? "",
    last_name: (l.last_name as string) ?? "",
    role: l.parent_lead_id ? ((l.co_person_role as string) ?? "applicant") : "primary",
  }));

  const leadIds = parties.map((p) => p.lead_id);
  if (leadIds.length === 0) {
    return NextResponse.json({ success: true, parties: [], documents: [], otherDocuments: [] });
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

  const documents = allDocs.filter((d) => d.doc_type !== ADMIN_OTHER_DOC_TYPE);
  const otherDocuments = allDocs.filter((d) => d.doc_type === ADMIN_OTHER_DOC_TYPE);

  return NextResponse.json({ success: true, parties, documents, otherDocuments });
}

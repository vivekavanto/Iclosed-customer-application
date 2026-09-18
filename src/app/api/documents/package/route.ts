import { NextResponse } from "next/server";
import JSZip from "jszip";
import { get } from "@vercel/blob";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { getAuthClientDeals } from "@/lib/getAuthClient";
import { isBlobUrl, isPrivateBlobUrl, blobTokenForUrl } from "@/lib/blobPrivacy";

// Needs Node for @vercel/blob and the service-role client.
export const runtime = "nodejs";
export const maxDuration = 120;

function sanitizeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
}

function extFromUrlOrName(fileUrl: string, fileName: string | null): string {
  const source = fileName || fileUrl;
  const dot = source.lastIndexOf(".");
  if (dot <= 0) return "";
  const ext = source.slice(dot + 1).split(/[?#]/)[0];
  return /^[A-Za-z0-9]{1,5}$/.test(ext) ? ext : "";
}

async function fetchBytes(fileUrl: string): Promise<Buffer> {
  if (isPrivateBlobUrl(fileUrl)) {
    const result = await get(fileUrl, { access: "private", token: blobTokenForUrl(fileUrl) });
    if (!result?.stream) throw new Error("private blob not found");
    return Buffer.from(await new Response(result.stream).arrayBuffer());
  }
  const res = await fetch(fileUrl);
  if (!res.ok) throw new Error(`status ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// GET /api/documents/package — every visible document for the client's family, zipped into one file.
export async function GET() {
  const auth = await getAuthClientDeals();
  if (!auth) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const ownLeadIds = [
    ...new Set((auth.deals ?? []).map((d) => d.lead_id).filter((x): x is string => !!x)),
  ];
  if (ownLeadIds.length === 0) {
    return NextResponse.json({ error: "No documents to download" }, { status: 404 });
  }

  const { data: ownLeads } = await supabaseAdmin
    .from("leads")
    .select("id, parent_lead_id")
    .in("id", ownLeadIds);

  const rootIds = [...new Set((ownLeads ?? []).map((l) => l.parent_lead_id ?? l.id))];
  if (rootIds.length === 0) {
    return NextResponse.json({ error: "No documents to download" }, { status: 404 });
  }

  const orFilter = rootIds.map((r) => `id.eq.${r},parent_lead_id.eq.${r}`).join(",");
  const { data: familyLeads } = await supabaseAdmin.from("leads").select("id").or(orFilter);
  const leadIds = (familyLeads ?? []).map((l) => l.id as string);
  if (leadIds.length === 0) {
    return NextResponse.json({ error: "No documents to download" }, { status: 404 });
  }

  const { data: docs, error } = await supabaseAdmin
    .from("lead_corporate_docs")
    .select("doc_type, custom_type, file_name, file_url")
    .in("lead_id", leadIds)
    .eq("hidden_from_client", false)
    .not("file_url", "is", null);

  if (error) {
    console.error("[GET /api/documents/package] query failed:", error.message);
    return NextResponse.json({ error: "Could not load documents" }, { status: 500 });
  }
  if (!docs || docs.length === 0) {
    return NextResponse.json({ error: "No documents to download" }, { status: 404 });
  }

  const zip = new JSZip();
  const used = new Set<string>();
  let anyOk = false;

  for (const d of docs) {
    const fileUrl = d.file_url as string;
    if (!isBlobUrl(fileUrl)) continue; // SSRF guard — only ever fetch our own blob storage

    const label = (d.custom_type as string) || (d.file_name as string) || "Document";
    const ext = extFromUrlOrName(fileUrl, d.file_name as string | null);
    let base = sanitizeName(label);
    if (ext && !base.toLowerCase().endsWith(`.${ext.toLowerCase()}`)) base = `${base}.${ext}`;

    let name = base;
    for (let n = 2; used.has(name); n++) {
      const dot = base.lastIndexOf(".");
      name = dot > 0 ? `${base.slice(0, dot)} (${n})${base.slice(dot)}` : `${base} (${n})`;
    }
    used.add(name);

    try {
      zip.file(name, await fetchBytes(fileUrl));
      anyOk = true;
    } catch (err) {
      console.error(`[documents/package] failed to fetch "${name}":`, err);
    }
  }

  if (!anyOk) {
    return NextResponse.json({ error: "Could not build the documents ZIP" }, { status: 500 });
  }

  const body = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  return new NextResponse(new Uint8Array(body), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="iclosed-documents.zip"`,
      "Content-Length": String(body.length),
      "Cache-Control": "no-store",
    },
  });
}

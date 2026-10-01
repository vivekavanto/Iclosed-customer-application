// Sets the deal deposit from APS files uploaded to a task.
import supabaseAdmin from "@/lib/supabaseAdmin";
import { readBlobDocument } from "@/lib/blobDocument";
import { mergeApsExtractions, normalizeAmount, type ApsExtractionResult } from "@/lib/apsExtraction";
import { readApsDocument, SUPPORTED_MIME_TYPES } from "@/lib/apsReader";
import { getLinkedDealIds } from "@/lib/getLinkedDealIds";

// Some blobs are stored as octet-stream; fall back to the file extension.
function mimeFor(contentType: string | undefined, pathname: string): string {
  const type = (contentType ?? "").toLowerCase();
  if (type && type !== "application/octet-stream") return type;
  const ext = pathname.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "application/pdf";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  return type;
}

/** Task title or file label that marks an APS upload. */
export function isApsLabel(text: string | null | undefined): boolean {
  return (text ?? "").toLowerCase().includes("agreement of purchase");
}

/** Sets deposit on the deal and co-purchaser deals; skips sales. */
export async function fillDealDepositFromAps(opts: {
  dealId: string;
  side?: string | null;
  fileUrls: string[];
}): Promise<void> {
  const { dealId, side, fileUrls } = opts;
  if (fileUrls.length === 0 || side === "sale") return;

  const { data: deal } = await supabaseAdmin
    .from("deals")
    .select("id, type")
    .eq("id", dealId)
    .maybeSingle();
  if (!deal) return;
  if ((deal.type ?? "").trim().toLowerCase() === "sale") return;

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) {
    console.error("[aps-deposit] GEMINI_API_KEY is not set; APS not read");
    return;
  }

  // One read per file, merged like intake.
  const reads: ApsExtractionResult[] = [];
  for (const url of fileUrls) {
    try {
      const doc = await readBlobDocument(url);
      const mimeType = mimeFor(doc.meta.contentType, doc.meta.pathname);
      if (!SUPPORTED_MIME_TYPES.has(mimeType)) continue;
      const read = await readApsDocument({ apiKey, side: "purchase", bytes: doc.bytes, mimeType });
      if (read.ok) reads.push(read.result);
    } catch (err) {
      console.error("[aps-deposit] read failed:", err instanceof Error ? err.message : err);
    }
  }

  const merged = mergeApsExtractions(reads);
  const deposit = merged.is_aps ? normalizeAmount(merged.deposit.value, { min: 1 }) : null;
  if (!deposit) {
    console.log(`[aps-deposit] deal=${dealId} no deposit read from ${fileUrls.length} file(s)`);
    return;
  }

  const dealIds = [dealId, ...(await getLinkedDealIds(dealId))];
  const { data: updated } = await supabaseAdmin
    .from("deals")
    .update({ deposit_amount: deposit })
    .in("id", dealIds)
    .select("lead_id");
  const leadIds = (updated ?? []).map((d) => d.lead_id).filter(Boolean);
  if (leadIds.length > 0) {
    await supabaseAdmin.from("leads").update({ deposit_amount: deposit }).in("id", leadIds);
  }
  console.log(`[aps-deposit] deals=${updated?.length ?? 0} deposit=${deposit} (${merged.deposit.confidence})`);
}

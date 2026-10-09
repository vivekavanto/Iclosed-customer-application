// Sets the deal deposit from APS files uploaded to a task.
import supabaseAdmin from "@/lib/supabaseAdmin";
import { readBlobDocument } from "@/lib/blobDocument";
import { mergeApsExtractions, normalizeAmount, type ApsExtractionResult } from "@/lib/apsExtraction";
import { readApsDocument, SUPPORTED_MIME_TYPES, TOTAL_BUDGET_MS } from "@/lib/apsReader";
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

/** Deposit read off APS files, fast model first. */
export async function readApsDeposit(
  fileUrls: string[],
  apsSide: "purchase" | "sale",
): Promise<{ merged: ApsExtractionResult; deposit: string | null } | null> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) {
    console.error("[aps-deposit] GEMINI_API_KEY is not set; APS not read");
    return null;
  }
  const startedAt = Date.now();
  // One read per file, in parallel so several files fit the time limit; merged like intake.
  const readAll = async (order: "quality" | "fast") => {
    const settled = await Promise.all(
      fileUrls.map(async (url): Promise<ApsExtractionResult | null> => {
        try {
          const doc = await readBlobDocument(url);
          const mimeType = mimeFor(doc.meta.contentType, doc.meta.pathname);
          if (!SUPPORTED_MIME_TYPES.has(mimeType)) return null;
          // Shared start time: both passes fit one budget.
          const read = await readApsDocument({ apiKey, side: apsSide, bytes: doc.bytes, mimeType, order, startedAt });
          return read.ok ? read.result : null;
        } catch (err) {
          console.error("[aps-deposit] read failed:", err instanceof Error ? err.message : err);
          return null;
        }
      }),
    );
    const reads = settled.filter((r): r is ApsExtractionResult => r !== null);
    const merged = mergeApsExtractions(reads);
    const deposit = merged.is_aps ? normalizeAmount(merged.deposit.value, { min: 1 }) : null;
    return { merged, deposit, answered: reads.length > 0 };
  };
  const fast = await readAll("fast");
  if (fast.deposit || !fast.answered) return fast;
  return readAll("quality");
}

// Stores condo fees beside the intake read, where the draft looks.
async function saveCommonExpenses(dealIds: string[], value: string, confidence: string): Promise<void> {
  const { data: deals } = await supabaseAdmin.from("deals").select("lead_id").in("id", dealIds);
  const leadIds = (deals ?? []).map((d) => d.lead_id).filter(Boolean);
  if (leadIds.length === 0) return;
  const { data: leads } = await supabaseAdmin.from("leads").select("id, aps_extraction").in("id", leadIds);
  for (const lead of leads ?? []) {
    const aps = (lead.aps_extraction ?? {}) as Record<string, { result?: Record<string, unknown> } | undefined>;
    const purchase = aps.purchase ?? {};
    const next = {
      ...aps,
      purchase: { ...purchase, result: { ...(purchase.result ?? {}), common_expenses: { value, confidence } } },
    };
    await supabaseAdmin.from("leads").update({ aps_extraction: next }).eq("id", lead.id);
  }
}

/** Sets the deal family's deposit from task APS uploads. */
export async function fillDealDepositFromAps(opts: {
  dealId: string;
  side?: string | null;
  fileUrls: string[];
}): Promise<void> {
  const { dealId, side, fileUrls } = opts;
  if (fileUrls.length === 0) return;

  const { data: deal } = await supabaseAdmin
    .from("deals")
    .select("id, type")
    .eq("id", dealId)
    .maybeSingle();
  if (!deal) return;
  const type = (deal.type ?? "").trim().toLowerCase();
  const apsSide = side === "sale" || type === "sale" ? "sale" : "purchase";
  // Buy & Sell sale deposit lives on the lead.
  const sellingColumn = apsSide === "sale" && type === "purchase & sale";

  const startedAt = Date.now();
  const read = await readApsDeposit(fileUrls, apsSide);
  if (!read) return;
  const { merged, deposit } = read;
  const took = `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;
  const dealIds = [dealId, ...(await getLinkedDealIds(dealId))];
  const commonExpenses = merged.is_aps ? normalizeAmount(merged.common_expenses?.value, { min: 1 }) : null;
  if (apsSide === "purchase" && commonExpenses) await saveCommonExpenses(dealIds, commonExpenses, merged.common_expenses?.confidence ?? "low");
  if (!deposit) {
    console.log(`[aps-deposit] deal=${dealId} no deposit read from ${fileUrls.length} file(s) in ${took}`);
    return;
  }

  if (sellingColumn) {
    const { data: linked } = await supabaseAdmin.from("deals").select("lead_id").in("id", dealIds);
    const ids = (linked ?? []).map((d) => d.lead_id).filter(Boolean);
    if (ids.length > 0) await supabaseAdmin.from("leads").update({ selling_deposit_amount: deposit }).in("id", ids);
    console.log(`[aps-deposit] sale leads=${ids.length} deposit=${deposit} (${merged.deposit.confidence}) in ${took}`);
    return;
  }
  const { data: updated } = await supabaseAdmin
    .from("deals")
    .update({ deposit_amount: deposit })
    .in("id", dealIds)
    .select("lead_id");
  const leadIds = (updated ?? []).map((d) => d.lead_id).filter(Boolean);
  if (leadIds.length > 0) {
    await supabaseAdmin.from("leads").update({ deposit_amount: deposit }).in("id", leadIds);
  }
  console.log(`[aps-deposit] deals=${updated?.length ?? 0} deposit=${deposit} (${merged.deposit.confidence}) in ${took}`);
}

/** Intake backup: sets the lead family's deposit from the APS. */
export async function fillLeadDepositFromAps(opts: {
  leadId: string;
  side: "purchase" | "sale";
  fileUrl: string;
}): Promise<void> {
  const { leadId, side, fileUrl } = opts;
  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("id, parent_lead_id, lead_type, aps_extraction")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return;
  const column =
    side === "sale" && lead.lead_type === "Purchase & Sale" ? "selling_deposit_amount" : "deposit_amount";
  // The browser read already supplied the APS deposit.
  const extraction = lead.aps_extraction as Record<string, { result?: { deposit?: { value?: unknown } } }> | null;
  if (normalizeAmount(extraction?.[side]?.result?.deposit?.value, { min: 1 })) return;

  const read = await readApsDeposit([fileUrl], side);
  if (!read?.deposit) {
    console.log(`[aps-deposit] lead=${leadId} ${side}: no deposit read`);
    return;
  }

  const primaryId = lead.parent_lead_id ?? lead.id;
  const { data: family } = await supabaseAdmin
    .from("leads")
    .update({ [column]: read.deposit })
    .or(`id.eq.${primaryId},parent_lead_id.eq.${primaryId}`)
    .select("id");
  // A deal made before the read finished takes it too.
  if (column === "deposit_amount" && family?.length) {
    await supabaseAdmin
      .from("deals")
      .update({ deposit_amount: read.deposit })
      .in("lead_id", family.map((l) => l.id));
  }
  console.log(`[aps-deposit] lead=${leadId} ${side}: ${column}=${read.deposit} (backup)`);
}

// The read's budget plus slack for the upload and save.
const PENDING_WINDOW_MS = TOTAL_BUDGET_MS + 20_000;

/** True while an APS task on this side saved moments ago may still be reading. */
export async function apsDepositPending(dealId: string, side: "purchase" | "sale" = "purchase"): Promise<boolean> {
  const since = new Date(Date.now() - PENDING_WINDOW_MS).toISOString();
  const { data } = await supabaseAdmin
    .from("tasks")
    .select("id, side")
    .eq("deal_id", dealId)
    .ilike("title", "%agreement of purchase%")
    .gte("completed_at", since)
    .limit(5);
  return (data ?? []).some((t) => (side === "sale" ? t.side !== "purchase" : t.side !== "sale"));
}

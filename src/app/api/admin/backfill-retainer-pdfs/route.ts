import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { put, del } from "@vercel/blob";
import { generateRetainerPdf } from "@/lib/generateRetainerPdf";
import { getLeadFirmKey } from "@/lib/leadFirm";
import { BLOB_ACCESS, blobToken, blobTokenForUrl } from "@/lib/blobPrivacy";

/**
 * POST /api/admin/backfill-retainer-pdfs
 *
 * One-shot recovery endpoint that generates the missing PDF + lead_corporate_docs
 * row for every retainer_signatures row whose PDF was lost because of the
 * CHECK constraint bug (doc_type='retainer_agreement' was previously rejected
 * by Postgres, so the original sign endpoint silently dropped the PDF).
 *
 * Query params:
 *   - dry_run=true  Lists what would be processed without actually generating
 *                   any PDFs. Use this first to confirm the scope.
 *   - secret=...    Required if BACKFILL_SECRET env var is set, otherwise
 *                   open (admin endpoints in this repo have no auth by
 *                   convention; set the env var to gate this destructive op).
 *   - rebrand=true  RE-BRAND mode — see below. Requires lead_id.
 *   - lead_id=...   Restrict to one lead. Required by rebrand mode.
 *
 * ── RE-BRAND MODE ──────────────────────────────────────────────────────────
 * A retainer PDF is rendered ONCE, at signing, and stored. Which firm it names
 * and whose lockup it carries are baked in at that moment. Moving the file to
 * the other firm afterwards (admin → lead → Firm) changes `leads.firm_key` and
 * nothing else, so every later send still attaches the ORIGINAL document: the
 * admin "Send Email" action re-renders the email BODY under the file's current
 * firm but attaches the stored PDF verbatim, which is how a client ends up with
 * an iClosed-branded email carrying a Nava Wilson retainer.
 *
 * `rebrand=true` re-renders this lead's retainer PDF(s) under the firm the file
 * is on TODAY and REPLACES the stored document — the lead_corporate_docs row is
 * updated in place and the superseded blob deleted. Replacing rather than
 * inserting is deliberate: the send path attaches EVERY retainer_agreement row
 * on the lead, so a second row would mail the client both versions.
 *
 * ⚠ This rewrites an executed agreement. The signature, the signed date and the
 * wording are all reproduced from the stored signature row, but the entity the
 * client agreed to retain CHANGES, and the regenerated document carries a new
 * unique ID (IC-YYYYMMDD-RB####) because the original's sequential number is not
 * recoverable. Only re-brand a file whose firm was genuinely re-assigned, and
 * dry-run first.
 *
 * Returns:
 *   {
 *     dry_run: boolean,
 *     total_signatures: number,
 *     already_had_pdf: number,
 *     processed: Array<{ signature_id, lead_id, side, file_url? }>,
 *     failed:    Array<{ signature_id, lead_id, side, error }>,
 *   }
 *
 * Safe to re-run: signatures whose PDF already exists in lead_corporate_docs
 * (matched by lead_id + doc_type='retainer_agreement' + expected file_name)
 * are skipped.
 */

const PURCHASE_AND_SALE = "Purchase & Sale";

type Side = "purchase" | "sale" | null;

function expectedFileName(side: Side): string {
  if (side === "sale") return "retainer-agreement-sale.pdf";
  if (side === "purchase") return "retainer-agreement-purchase.pdf";
  return "retainer-agreement.pdf";
}

export async function POST(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const dryRun = searchParams.get("dry_run") === "true";
    const secret = searchParams.get("secret");
    const rebrand = searchParams.get("rebrand") === "true";
    const leadIdFilter = searchParams.get("lead_id");

    // Re-brand replaces documents a client has already been sent, so it is
    // never allowed to run file-wide: an un-scoped call would rewrite every
    // signed retainer in the database under whatever firm each file happens to
    // sit on now. One lead at a time, named explicitly.
    if (rebrand && !leadIdFilter) {
      return NextResponse.json(
        {
          success: false,
          error:
            "rebrand=true requires lead_id — re-branding is per-file and must name the file.",
        },
        { status: 400 },
      );
    }

    const requiredSecret = process.env.BACKFILL_SECRET;
    if (requiredSecret && secret !== requiredSecret) {
      return NextResponse.json(
        { success: false, error: "Invalid or missing secret" },
        { status: 401 },
      );
    }

    // 1. Load every signature row (or just this lead's, when scoped).
    let sigQuery = supabaseAdmin
      .from("retainer_signatures")
      .select("id, lead_id, full_name, signature, signed_date, side, created_at")
      .order("created_at", { ascending: true });
    if (leadIdFilter) sigQuery = sigQuery.eq("lead_id", leadIdFilter);
    const { data: signatures, error: sigErr } = await sigQuery;

    if (sigErr) {
      return NextResponse.json(
        { success: false, error: `signatures fetch failed: ${sigErr.message}` },
        { status: 500 },
      );
    }

    if (!signatures || signatures.length === 0) {
      return NextResponse.json({
        success: true,
        dry_run: dryRun,
        total_signatures: 0,
        already_had_pdf: 0,
        processed: [],
        failed: [],
      });
    }

    // 2. Load all existing retainer doc rows so we can skip ones already
    //    persisted (idempotent re-runs).
    const leadIds = Array.from(new Set(signatures.map((s) => s.lead_id)));
    const { data: existingDocs } = await supabaseAdmin
      .from("lead_corporate_docs")
      .select("id, lead_id, file_name, file_url")
      .in("lead_id", leadIds)
      .eq("doc_type", "retainer_agreement");

    const existingKeys = new Set(
      (existingDocs ?? []).map((d) => `${d.lead_id}::${d.file_name}`),
    );

    // Re-brand needs the row itself, not just "does one exist" — it updates the
    // row in place and deletes the blob the row used to point at.
    const existingDocByKey = new Map(
      (existingDocs ?? []).map((d) => [`${d.lead_id}::${d.file_name}`, d]),
    );

    // 3. Load the leads we need addresses + lead_type for.
    const { data: leads } = await supabaseAdmin
      .from("leads")
      .select(
        "id, lead_type, address_street, address_city, address_province, address_postal_code, selling_address_street, selling_address_city, selling_address_province, selling_address_postal_code",
      )
      .in("id", leadIds);

    const leadById = new Map((leads ?? []).map((l) => [l.id, l]));

    const processed: Array<{
      signature_id: string;
      lead_id: string;
      side: Side;
      firm_key?: string;
      action?: "insert" | "replace";
      replaces_url?: string;
      file_url?: string;
    }> = [];
    const failed: Array<{
      signature_id: string;
      lead_id: string;
      side: Side;
      error: string;
    }> = [];
    let alreadyHadPdf = 0;

    // 4. Walk each signature.
    for (const sig of signatures) {
      const side = (sig.side ?? null) as Side;
      const fileName = expectedFileName(side);
      const key = `${sig.lead_id}::${fileName}`;

      // Backfill exists to fill GAPS, so an existing PDF is a skip. Re-brand is
      // the opposite: the existing PDF is precisely what it is there to replace.
      const existingDoc = existingDocByKey.get(key) ?? null;
      if (existingKeys.has(key) && !rebrand) {
        alreadyHadPdf += 1;
        continue;
      }

      const lead = leadById.get(sig.lead_id);

      try {
        const purchaseAddress = lead
          ? [
              lead.address_street,
              lead.address_city,
              lead.address_province,
              lead.address_postal_code,
            ]
              .filter(Boolean)
              .join(", ")
          : "";
        const saleAddress = lead
          ? [
              lead.selling_address_street,
              lead.selling_address_city,
              lead.selling_address_province,
              lead.selling_address_postal_code,
            ]
              .filter(Boolean)
              .join(", ")
          : "";

        // A signature with side=null on a P&S lead means it was signed under
        // the new combined-retainer flow → PDF shows both addresses.
        // A signature with side='purchase' / 'sale' means it was signed under
        // the legacy two-PDF flow → PDF shows just that side's address.
        const isPSCombined =
          side === null && lead?.lead_type === PURCHASE_AND_SALE;

        const propertyAddress = isPSCombined
          ? [purchaseAddress, saleAddress].filter(Boolean).join(" / ")
          : side === "sale"
            ? saleAddress
            : purchaseAddress;

        // Use a stable, deterministic unique ID derived from the signature
        // row so re-runs produce the same value. Format mirrors the original
        // `IC-YYYYMMDD-XXXX` shape; the trailing token is the first 4 chars of
        // the signature UUID (uppercased) behind a two-letter marker — `BF` for
        // a gap-fill, `RB` for a re-brand, because those are different
        // operations and a document should say which one produced it. Neither
        // can reproduce the original sequential number: that was a live COUNT
        // at signing time and is not recoverable.
        const dateKey = (sig.signed_date ?? "").replace(/-/g, "");
        const idSuffix = sig.id.replace(/-/g, "").slice(0, 4).toUpperCase();
        const uniqueId = `IC-${dateKey}-${rebrand ? "RB" : "BF"}${idSuffix}`;

        // The firm the file is on TODAY. A gap-fill uses it because it stands in
        // for a PDF a fresh signature would have produced; a re-brand uses it
        // because moving the file to the other firm is the whole point.
        const firmKey = await getLeadFirmKey(sig.lead_id);

        if (dryRun) {
          processed.push({
            signature_id: sig.id,
            lead_id: sig.lead_id,
            side,
            firm_key: firmKey,
            action: existingDoc ? "replace" : "insert",
            replaces_url: existingDoc?.file_url ?? undefined,
          });
          continue;
        }

        // Generate PDF
        const pdfBytes = await generateRetainerPdf({
          fullName: sig.full_name ?? "",
          signature: sig.signature ?? "",
          signedDate: sig.signed_date ?? "",
          propertyAddress,
          leadType: lead?.lead_type ?? "",
          uniqueId,
          side,
          purchaseAddress: isPSCombined ? purchaseAddress : undefined,
          saleAddress: isPSCombined ? saleAddress : undefined,
          firmKey,
        });

        // Upload to Vercel Blob (same path convention as the live sign route)
        const sideSegment = side ?? "main";
        const blob = await put(
          `corporate-docs/${sig.lead_id}/${sideSegment}/${Date.now()}-retainer-agreement.pdf`,
          Buffer.from(pdfBytes),
          { access: BLOB_ACCESS, token: blobToken()! },
        );

        // Point lead_corporate_docs at the new file. A re-brand UPDATES the row
        // it found rather than inserting a second one: every send path attaches
        // ALL of a lead's retainer_agreement rows, so an extra row would mail
        // the client both the old and the new version of the same agreement.
        if (existingDoc) {
          const { error: updErr } = await supabaseAdmin
            .from("lead_corporate_docs")
            .update({ file_url: blob.url, file_name: fileName })
            .eq("id", existingDoc.id);

          if (updErr) {
            throw new Error(`update failed: ${updErr.message}`);
          }

          // Only once the row no longer references it. Failing to delete the
          // superseded blob leaves an orphan, which is wasteful but harmless —
          // it must never fail the re-brand that has already been recorded.
          try {
            await del(existingDoc.file_url, {
              token: blobTokenForUrl(existingDoc.file_url),
            });
          } catch (delErr) {
            console.error(
              "[Backfill Retainer PDFs] superseded blob not deleted:",
              existingDoc.file_url,
              delErr,
            );
          }
        } else {
          const { error: docErr } = await supabaseAdmin
            .from("lead_corporate_docs")
            .insert({
              lead_id: sig.lead_id,
              doc_type: "retainer_agreement",
              file_name: fileName,
              file_url: blob.url,
              is_identification: false,
            });

          if (docErr) {
            throw new Error(`insert failed: ${docErr.message}`);
          }
        }

        processed.push({
          signature_id: sig.id,
          lead_id: sig.lead_id,
          side,
          firm_key: firmKey,
          action: existingDoc ? "replace" : "insert",
          replaces_url: existingDoc?.file_url ?? undefined,
          file_url: blob.url,
        });
      } catch (err) {
        failed.push({
          signature_id: sig.id,
          lead_id: sig.lead_id,
          side,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return NextResponse.json({
      success: true,
      dry_run: dryRun,
      rebrand,
      lead_id: leadIdFilter ?? null,
      total_signatures: signatures.length,
      already_had_pdf: alreadyHadPdf,
      processed,
      failed,
    });
  } catch (err) {
    console.error("[Backfill Retainer PDFs] Server error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Server error",
      },
      { status: 500 },
    );
  }
}

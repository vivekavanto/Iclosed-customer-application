import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { put } from "@vercel/blob";
import { generateRetainerPdf } from "@/lib/generateRetainerPdf";

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

    const requiredSecret = process.env.BACKFILL_SECRET;
    if (requiredSecret && secret !== requiredSecret) {
      return NextResponse.json(
        { success: false, error: "Invalid or missing secret" },
        { status: 401 },
      );
    }

    // 1. Load every signature row.
    const { data: signatures, error: sigErr } = await supabaseAdmin
      .from("retainer_signatures")
      .select("id, lead_id, full_name, signature, signed_date, side, created_at")
      .order("created_at", { ascending: true });

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
      .select("lead_id, file_name")
      .in("lead_id", leadIds)
      .eq("doc_type", "retainer_agreement");

    const existingKeys = new Set(
      (existingDocs ?? []).map((d) => `${d.lead_id}::${d.file_name}`),
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

      if (existingKeys.has(key)) {
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
        // row so re-runs would produce the same value. Format mirrors the
        // original `IC-YYYYMMDD-XXXX` shape; the trailing token uses the
        // first 4 chars of the signature UUID (uppercased) prefixed with BF
        // to mark it as a backfilled PDF.
        const dateKey = (sig.signed_date ?? "").replace(/-/g, "");
        const idSuffix = sig.id.replace(/-/g, "").slice(0, 4).toUpperCase();
        const uniqueId = `IC-${dateKey}-BF${idSuffix}`;

        if (dryRun) {
          processed.push({
            signature_id: sig.id,
            lead_id: sig.lead_id,
            side,
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
        });

        // Upload to Vercel Blob (same path convention as the live sign route)
        const sideSegment = side ?? "main";
        const blob = await put(
          `corporate-docs/${sig.lead_id}/${sideSegment}/${Date.now()}-retainer-agreement.pdf`,
          Buffer.from(pdfBytes),
          { access: "public", token: process.env.BLOB_READ_WRITE_TOKEN! },
        );

        // Insert into lead_corporate_docs
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

        processed.push({
          signature_id: sig.id,
          lead_id: sig.lead_id,
          side,
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

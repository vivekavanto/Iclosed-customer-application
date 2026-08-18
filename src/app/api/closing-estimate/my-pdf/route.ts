import { NextResponse } from "next/server";
import { computeStatement, type ClosingCostInputs } from "@/lib/closingCosts";
import { closingCostPdfFileName, generateClosingCostPdf } from "@/lib/closingCostPdf";
import {
  parseClientMortgage,
  parseFileId,
  rejectLockedInputs,
  resolveClientEstimateContext,
} from "@/lib/clientEstimateContext";

// POST /api/closing-estimate/my-pdf
//
// Generates a PDF of the estimate the CLIENT built with their own numbers.
//
// Distinct from GET /api/closing-estimate/pdf, which streams the statement the
// firm issued. That one is the firm's document; this one is the client's own
// planning copy, and nothing here is written to `deal_closing_estimates`.
//
// ── What the caller may decide ──────────────────────────────────────────
// The mortgage amount and the first-time-buyer flag. That is the whole list.
// The price, the deposit, the purchasers, the property, the file number, the
// firm whose letterhead this carries and the fee schedule behind it all come
// from the client's own file, resolved server-side.
//
// This matters more here than anywhere else in the portal: the output is a
// document on the firm's letterhead. Reading any of it from the request body
// would let a client print whatever figures and whatever name they liked under
// the firm's name.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request" },
      { status: 400 },
    );
  }

  const locked = rejectLockedInputs(body);
  if (locked) {
    return NextResponse.json({ success: false, error: locked }, { status: 400 });
  }

  // Which of the client's own files this is about. Checked against the session's
  // deals by the resolver, so an id that is not theirs is a 404.
  const fileId = parseFileId(body.file_id);
  if (fileId !== null && typeof fileId !== "string") {
    return NextResponse.json(
      { success: false, error: fileId.error },
      { status: 404 },
    );
  }

  const resolved = await resolveClientEstimateContext(fileId);
  if (!resolved.ok) {
    return NextResponse.json(
      { success: false, error: resolved.error },
      { status: resolved.status },
    );
  }
  const ctx = resolved.context;

  const mortgage = parseClientMortgage(body.mortgage_amount);
  if (typeof mortgage !== "number") {
    return NextResponse.json(
      { success: false, error: mortgage.error },
      { status: 400 },
    );
  }

  if (ctx.locked.price <= 0) {
    return NextResponse.json(
      { success: false, error: "We don't have a purchase price on your file yet." },
      { status: 400 },
    );
  }

  const inputs: ClosingCostInputs = {
    price: ctx.locked.price,
    deposit: ctx.locked.deposit,
    mortgage,
    isToronto: ctx.locked.isToronto,
    isFirstTimeBuyer: body.is_first_time_buyer === true,
    titlePremiumOverride: ctx.locked.titlePremiumOverride,
    propertyTaxAdjustment: ctx.locked.propertyTaxAdjustment,
    // null → undefined: the firm never said, so each line keeps its default.
    titlePremiumIsEstimate: ctx.locked.titlePremiumIsEstimate ?? undefined,
    teraviewIsEstimate: ctx.locked.teraviewIsEstimate ?? undefined,
    sheriffIsEstimate: ctx.locked.sheriffIsEstimate ?? undefined,
    propertyTaxIsEstimate: ctx.locked.propertyTaxIsEstimate ?? undefined,
  };
  const statement = computeStatement(inputs, ctx.rates);

  try {
    const bytes = await generateClosingCostPdf({
      statement,
      config: ctx.config,
      statementType: ctx.statementType,
      fileNo: ctx.locked.fileNo,
      propertyAddress: ctx.locked.propertyAddress,
      clientName: ctx.locked.purchasers ?? ctx.client.fullName ?? null,
      closingDate: ctx.locked.closingDate,
      preparedOn: new Date().toISOString().slice(0, 10),
      // The client's own copy is always a planning estimate — there is no path
      // here that produces a Final account, so it always carries the watermark.
      draft: true,
      // Stamped in the same format the firm's own statements carry, so the two
      // can be told apart — or matched — at a glance.
      configVersion: ctx.configVersion,
    });

    return new NextResponse(bytes as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${closingCostPdfFileName(
          ctx.locked.fileNo,
        )}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("[closing-estimate my-pdf] generation failed:", err);
    return NextResponse.json(
      { success: false, error: "Could not build your PDF. Please try again." },
      { status: 500 },
    );
  }
}

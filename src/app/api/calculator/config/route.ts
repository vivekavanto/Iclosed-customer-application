import { NextResponse } from "next/server";
import {
  publicConfigPayload,
  readPublicConfig,
} from "@/lib/publicClosingEstimate";

// GET /api/calculator/config — the firm's published fee schedule and letterhead.
//
// PUBLIC BY DESIGN. src/middleware.ts matches /api/:path*, but a request with no
// session cookie is passed straight through (`handleSession` only guards PAGES
// when there is nothing to refresh), so an anonymous caller reaches this route
// exactly as intake and referral do.
//
// Nothing here is per-file, per-client or per-lead: it returns the same rate card
// the firm already prints on every statement it sends, which is what lets the
// public page recompute the statement locally on each keystroke instead of
// round-tripping.
//
// The payload is an explicit allowlist in `publicConfigPayload` — see the note
// there on why it is additive rather than "the row minus a few keys".

export const dynamic = "force-dynamic";

export async function GET() {
  const { config, statementType } = await readPublicConfig();

  return NextResponse.json(
    { success: true, ...publicConfigPayload(config, statementType) },
    {
      headers: {
        // Settings edits should reach the public page quickly, but the rate card
        // is identical for every visitor — so a short shared cache absorbs a
        // burst of traffic without a stale price surviving long.
        "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
      },
    },
  );
}

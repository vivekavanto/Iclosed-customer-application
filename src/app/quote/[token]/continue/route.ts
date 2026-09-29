import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { verifyQuoteToken } from "@/lib/quoteToken";
import { getOrCreateRetainerToken } from "@/lib/quoteRetainerToken";

export const dynamic = "force-dynamic";

// "Continue with iClosed": swaps a quote token for the lead's retainer link.
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const origin = new URL(req.url).origin;
  const leadId = verifyQuoteToken(token);
  if (!leadId) return NextResponse.redirect(new URL("/login", origin));

  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("id, email")
    .eq("id", leadId)
    .maybeSingle();

  const retainerUrl = new URL("/retainer", origin);
  const retainerToken = lead?.email
    ? await getOrCreateRetainerToken({ leadId, email: lead.email, retainerUrl: retainerUrl.toString() })
    : null;

  // Fall back to the signed-in retainer flow if no link could be made.
  if (!retainerToken) return NextResponse.redirect(new URL("/login", origin));

  retainerUrl.searchParams.set("token", retainerToken);
  return NextResponse.redirect(retainerUrl);
}

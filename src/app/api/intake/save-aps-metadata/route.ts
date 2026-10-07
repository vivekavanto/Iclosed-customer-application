import supabaseAdmin from "@/lib/supabaseAdmin";
import { after, NextResponse } from "next/server";
import { fillLeadDepositFromAps } from "@/lib/fillDealDepositFromAps";

export const runtime = "nodejs";
// Room for the background deposit read.
export const maxDuration = 180;

export async function POST(req: Request) {
  try {
    const { lead_id, doc_type, file_name, file_url } = (await req.json()) as {
      lead_id?: string;
      doc_type?: string;
      file_name?: string;
      file_url?: string;
    };

    if (!lead_id || !doc_type || !file_name || !file_url) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from("lead_corporate_docs")
      .insert({
        lead_id,
        doc_type,
        file_name,
        file_url,
        is_identification: false,
      });

    if (error) throw new Error(error.message);

    // Backup when the browser read missed the deposit.
    if (doc_type === "aps_purchase" || doc_type === "aps_sale") {
      const side = doc_type === "aps_sale" ? "sale" : "purchase";
      after(() =>
        fillLeadDepositFromAps({ leadId: lead_id, side, fileUrl: file_url }).catch((err) =>
          console.error("[aps-deposit] backup failed:", err),
        ),
      );
    }

    return NextResponse.json({ success: true, url: file_url, file_name });
  } catch (err: any) {
    console.error("Save APS metadata error:", err.message || err);
    return NextResponse.json(
      { success: false, error: err.message || "Server error" },
      { status: 500 }
    );
  }
}

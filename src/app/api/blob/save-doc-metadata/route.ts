import supabaseAdmin from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";

// Generic metadata-save endpoint for blob uploads from dashboard drawers
// (DynamicTaskDrawer, etc.). After a successful client upload to Vercel Blob,
// the browser calls this to record the file in lead_corporate_docs — the same
// row /api/uploadblobstorage used to write inline.
export async function POST(req: Request) {
  try {
    const { lead_id, doc_type, file_name, file_url, custom_type } =
      (await req.json()) as {
        lead_id?: string;
        doc_type?: string;
        file_name?: string;
        file_url?: string;
        custom_type?: string | null;
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
        custom_type: custom_type ?? null,
        file_name,
        file_url,
        is_identification: false,
      });

    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, url: file_url, file_name });
  } catch (err: any) {
    console.error("Save doc metadata error:", err.message || err);
    return NextResponse.json(
      { success: false, error: err.message || "Server error" },
      { status: 500 }
    );
  }
}

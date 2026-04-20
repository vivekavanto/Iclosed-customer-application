import supabaseAdmin from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { put } from "@vercel/blob";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();

    const file = formData.get("file") as File | null;
    const lead_id = formData.get("lead_id") as string | null;
    const doc_type = formData.get("doc_type") as string | null;
    const custom_type = formData.get("custom_type") as string | null;

    if (!file) throw new Error("No file provided");
    if (!lead_id) throw new Error("No lead_id provided");
    if (!doc_type) throw new Error("No doc_type provided");

    console.log("Uploading file:", file.name);

    const blob = await put(
      `corporate-docs/${lead_id}/${Date.now()}-${file.name}`,
      file,
      {
        access: "public",
        token: process.env.BLOB_READ_WRITE_TOKEN!,
      }
    );

    console.log("Blob uploaded:", blob.url);
    console.log("Incoming doc_type:", doc_type);

    const { error } = await supabaseAdmin
      .from("lead_corporate_docs")
      .insert({
        lead_id,
        doc_type,
        custom_type: custom_type || null,
        file_name: file.name,
        file_url: blob.url,
      });

    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error("Upload error:", err.message || err);
    return NextResponse.json(
      { success: false, error: err.message || "Server error" },
      { status: 500 }
    );
  }
}
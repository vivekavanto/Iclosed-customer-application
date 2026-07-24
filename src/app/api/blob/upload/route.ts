import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { blobToken } from "@/lib/blobPrivacy";

// Generic client-upload token endpoint used by DynamicTaskDrawer and other
// dashboard drawers. Browser uploads go directly to Vercel Blob, bypassing
// the 4.5 MB serverless function body limit. Bump MAX_SIZE here to raise
// the ceiling (Vercel Blob itself supports multi-GB files via client uploads).
const MAX_SIZE = 25 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as HandleUploadBody;

    const jsonResponse = await handleUpload({
      body,
      request: req,
      // Client sends access: BLOB_ACCESS; the generated token must target the
      // matching store — private store's token once the flag is on (SEC-003).
      token: blobToken(),
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: MAX_SIZE,
          tokenPayload: clientPayload ?? null,
        };
      },
      onUploadCompleted: async ({ blob }) => {
        console.log("Generic blob upload complete:", blob.url);
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (err: any) {
    console.error("Blob upload token error:", err.message || err);
    return NextResponse.json(
      { error: err.message || "Server error" },
      { status: 400 }
    );
  }
}

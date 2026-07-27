import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { blobToken } from "@/lib/blobPrivacy";

const MAX_SIZE = 10 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
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
        console.log("APS upload complete:", blob.url);
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (err: any) {
    console.error("APS upload token error:", err.message || err);
    return NextResponse.json(
      { error: err.message || "Server error" },
      { status: 400 }
    );
  }
}

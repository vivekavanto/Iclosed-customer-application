import { NextResponse } from "next/server";
import { getAuthClient } from "@/lib/getAuthClient";

export async function GET() {
  try {
    const client = await getAuthClient();
    if (client) {
      return NextResponse.json({ success: true, user: client });
    }
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  } catch (err) {
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}

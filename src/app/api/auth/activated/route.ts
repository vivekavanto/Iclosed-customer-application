import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { notifyAdminActivation } from "@/lib/notifyAdminActivation";

/**
 * POST /api/auth/activated
 *
 * Fired by the set-password page the instant a client finishes activating their
 * account — the real "my client signed up" moment.
 *
 * Why it exists: activation happens entirely between the browser and Supabase
 * (`supabase.auth.updateUser({ password })`), and the page then signs the user
 * out to log in fresh. No server route of ours was involved, so the admin app
 * was never told. The deal still turned Active (a Postgres trigger flips it on
 * first sign-in), which made the file LOOK activated in the back office while
 * the referring agent's "your client just signed up" email never fired — it
 * hung off /api/auth/login, which a signing-up client may not reach for hours,
 * or ever.
 *
 * The email is taken from the caller's own Supabase session, never from the
 * request body, so this can't be used to trigger mail for someone else.
 * Best-effort: always answers 200 once the caller is authenticated, because a
 * notification problem must not make a successful activation look failed.
 */
export async function POST(request: Request) {
  try {
    let email: string | null = null;

    // Preferred: the access token the set-password page already holds. It works
    // even when the session lives only in the browser client.
    const authHeader = request.headers.get("authorization") ?? "";
    const bearer = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : "";

    if (bearer) {
      const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } },
      );
      const { data } = await supabaseAdmin.auth.getUser(bearer);
      email = data.user?.email ?? null;
    }

    // Fallback: the cookie session written by @supabase/ssr's browser client.
    if (!email) {
      const cookieStore = await cookies();
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll() {
              return cookieStore.getAll();
            },
            setAll() {
              // Read-only: this route never refreshes the session.
            },
          },
        },
      );
      const { data } = await supabase.auth.getUser();
      email = data.user?.email ?? null;
    }

    if (!email) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    await notifyAdminActivation(email, "ACTIVATED");

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[ACTIVATED] notification failed:", err);
    // Never surface a failure here — the account IS activated either way.
    return NextResponse.json({ success: true });
  }
}

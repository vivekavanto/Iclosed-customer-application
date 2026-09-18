import { NextResponse } from "next/server";
import supabaseAdmin from "./supabaseAdmin";
import { getAuthUser } from "./getAuthClient";

/**
 * Staff identity, resolved from the caller's own session.
 *
 * "Admin" here means a row in `admin_users` matching the session's email —
 * there is no role column anywhere in this app, and `role`/`role_type`
 * elsewhere in the codebase means a deal party (purchaser/seller), not a
 * permission. Membership in that table is the whole model.
 *
 * NOTE: this is deliberately NOT the `ADMIN_SERVICE_KEY` gate that
 * src/middleware.ts puts in front of /api/admin/*. That gate wants a shared
 * secret in a header, which a browser app could only satisfy by shipping the
 * secret in JavaScript — handing every visitor the key to /api/admin/leads and
 * its PII. It also proves the wrong thing: "a trusted machine is calling",
 * where a CMS needs "this specific person is staff" in order to record who
 * approved a post. Routes that authorize a human use this file instead, and
 * live outside /api/admin/ (which next.config.ts serves with a wildcard CORS
 * header that must never sit in front of a cookie-authenticated route).
 */
export type AdminSession = { email: string };

/**
 * The caller's staff identity, or null when they are not staff.
 *
 * Never throws. Having no session, or no cookie context at all, is the normal
 * case for a logged-out visitor and must only ever mean "not a known admin" —
 * never an error that a caller has to handle.
 */
export async function getAdminSession(): Promise<AdminSession | null> {
  try {
    const user = await getAuthUser();
    const email = user?.email?.trim() ?? null;
    if (!email) return null;

    const { data: adminRow } = await supabaseAdmin
      .from("admin_users")
      .select("id")
      .ilike("email", email)
      .maybeSingle();

    return adminRow ? { email } : null;
  } catch {
    return null;
  }
}

/**
 * Route-handler guard. Returns the staff identity, or the response to send.
 *
 * Usage:
 *   const auth = await requireAdmin();
 *   if (!auth.ok) return auth.response;
 *   // auth.admin.email is the reviewer of record from here on
 */
export async function requireAdmin(): Promise<
  { ok: true; admin: AdminSession } | { ok: false; response: NextResponse }
> {
  const admin = await getAdminSession();
  if (!admin) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Not authorized." },
        { status: 401 },
      ),
    };
  }
  return { ok: true, admin };
}

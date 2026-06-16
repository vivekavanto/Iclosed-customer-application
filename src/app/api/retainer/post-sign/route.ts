import { NextResponse } from "next/server";

/**
 * POST /api/retainer/post-sign
 *
 * After an account-free retainer signature, the signer chooses "Activate your
 * account" or "I'll do this later". This route forwards that choice to the
 * admin app's webhooks server-side (so there's no cross-origin call from the
 * browser) using the same retainer-sign `token`.
 *
 *   choice "activate" → admin /api/webhooks/retainer-activate-now
 *                       → returns { activate_url } the browser redirects to.
 *   choice "later"    → admin /api/webhooks/retainer-signed { choice: "later" }
 *                       → records the deferred-activation flag (best-effort).
 *
 * Public by construction: /api/retainer/* is not matched by the portal
 * middleware, and the token is the credential.
 *
 * Body: { token: string, choice: "activate" | "later" }
 */
export async function POST(req: Request) {
  try {
    const { token, choice } = (await req.json()) as {
      token?: string;
      choice?: "activate" | "later";
    };

    if (!token) {
      return NextResponse.json(
        { success: false, error: "token is required" },
        { status: 400 }
      );
    }

    const adminBase = (
      process.env.ADMIN_APP_URL ?? "https://devadmin.iclosed.ca"
    ).replace(/\/+$/, "");

    if (choice === "activate") {
      const r = await fetch(`${adminBase}/api/webhooks/retainer-activate-now`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d?.success) {
        return NextResponse.json(
          { success: false, error: d?.error ?? "Could not start activation" },
          { status: 502 }
        );
      }
      return NextResponse.json({ success: true, activate_url: d.activate_url ?? null });
    }

    // "later" — record the deferred-activation choice; never block the user.
    try {
      await fetch(`${adminBase}/api/webhooks/retainer-signed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, choice: "later" }),
      });
    } catch {
      // best-effort
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Retainer post-sign] error:", err);
    return NextResponse.json(
      { success: false, error: "Server error" },
      { status: 500 }
    );
  }
}

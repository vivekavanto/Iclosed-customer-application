import { NextResponse } from "next/server";
import { resolveRetainerLeadId } from "@/lib/retainerToken";
import { sendInviteEmail } from "@/lib/sendInviteEmail";
import { generateActivationLink } from "@/lib/generateActivationLink";

/**
 * POST /api/retainer/post-sign
 *
 * After an account-free retainer signature, the signer chooses "Activate your
 * account" or "I'll do this later". The two choices intentionally differ on the
 * activation email:
 *
 *   choice "activate" → mint a one-time set-password link and return it as
 *                       { activate_url } for the browser to redirect into. NO
 *                       email is sent — the user sets their password right away.
 *   choice "later"    → email the signer the activation link (via sendInviteEmail)
 *                       so they can activate from their inbox whenever they're
 *                       ready, and record the deferred choice with the admin app.
 *
 * The recipient is always the signer: `token` resolves to exactly one lead, so a
 * co-purchaser's link emails the co-purchaser and the primary's link emails the
 * primary. Both branches are best-effort beyond input validation — the signature
 * is already durable, so a failed email/link never loses the signing.
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

    // Where the set-password link lands — the portal's auth callback forwards to
    // /set-password once Supabase verifies the one-time link (mirrors convertLead).
    const portalBase = (
      process.env.NEXT_PUBLIC_CUSTOMER_PORTAL_URL ??
      "https://iclosed-customer-application-rosy.vercel.app"
    ).replace(/\/+$/, "");
    const redirectTo = `${portalBase}/api/auth/callback?next=/set-password`;

    // Both choices act on the signer's own lead.
    const leadId = await resolveRetainerLeadId(token);
    if (!leadId) {
      return NextResponse.json(
        { success: false, error: "This retainer link is invalid or has expired." },
        { status: 401 }
      );
    }

    if (choice === "activate") {
      // No email — mint a one-time set-password link and hand it back for the
      // browser to redirect into, so the user sets their password right away.
      const { action_link, error } = await generateActivationLink(leadId, redirectTo);
      if (!action_link) {
        return NextResponse.json(
          { success: false, error: error ?? "Could not start activation" },
          { status: 502 }
        );
      }
      return NextResponse.json({ success: true, activate_url: action_link });
    }

    // "later" — email the signer the activation link so they can activate from
    // their inbox whenever they're ready (the ONLY branch that sends an email),
    // and record the deferred choice with the admin app (best-effort).
    try {
      await fetch(`${adminBase}/api/webhooks/retainer-signed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, choice: "later" }),
      });
    } catch {
      // best-effort — admin bookkeeping must never block the email
    }

    const emailResult = await sendInviteEmail(leadId, redirectTo);
    if (!emailResult.success) {
      console.error("[Retainer post-sign] later email error:", emailResult.error);
    }
    return NextResponse.json({ success: true, email_sent: emailResult.success });
  } catch (err) {
    console.error("[Retainer post-sign] error:", err);
    return NextResponse.json(
      { success: false, error: "Server error" },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { verifyActivationToken } from "@/lib/activationToken";
import { generateActivationLink } from "@/lib/generateActivationLink";

// Always run fresh: every click must mint a NEW one-time Supabase link, so this
// response must never be cached or statically optimized.
export const dynamic = "force-dynamic";

/**
 * Stable entry point for the "Activate my account" email link.
 *
 * The email points here (with a signed, un-enumerable token) instead of at
 * Supabase's raw one-time invite link, which Supabase burns on the FIRST click
 * even if the user never set a password — that's why a second click used to land
 * on the "your reset link has expired" forgot-password screen.
 *
 * On EACH click:
 *   • password not set yet → mint a FRESH one-time set-password link and redirect
 *     into it. So the set-password page keeps working, click after click, until a
 *     password is actually saved.
 *   • password already set → this is a returning click on an old activation email;
 *     send them to request a password reset instead.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;

  const invalidLink = () =>
    NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(
        "This activation link is no longer valid. Please request a new one.",
      )}`,
    );

  const leadId = verifyActivationToken(url.searchParams.get("token"));
  if (!leadId) return invalidLink();

  const { action_link, passwordSet, error } = await generateActivationLink(
    leadId,
    `${origin}/api/auth/callback?next=/set-password`,
  );

  // Already activated → route to reset-password, not set-password.
  if (passwordSet) {
    return NextResponse.redirect(`${origin}/forgot-password`);
  }

  if (!action_link) {
    console.error(`[Activate] Could not mint link for lead ${leadId}:`, error);
    return invalidLink();
  }

  // Not activated yet → hand out a fresh one-time set-password link.
  return NextResponse.redirect(action_link);
}

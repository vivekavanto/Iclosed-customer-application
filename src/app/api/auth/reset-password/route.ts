import { NextResponse } from 'next/server';
import { sendResetPasswordEmail } from '@/lib/sendResetPasswordEmail';

/**
 * Triggers a password reset. The recovery link is generated here (not by the
 * admin panel) so its redirect target is derived from THIS request's origin —
 * dev requests get a dev link, prod gets a prod link. This is what fixes the
 * "email link opens production" problem on dev.iclosed.ca.
 */
export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== 'string' || !email.trim()) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const origin = getRequestOrigin(request);

    const result = await sendResetPasswordEmail(email.trim(), origin);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Something went wrong. Please try again.' },
        { status: 500 },
      );
    }

    // Always a generic success — never reveal whether the email exists.
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 },
    );
  }
}

/**
 * The public origin this request came in on. For a same-origin browser POST the
 * Origin header is the most reliable signal; behind Vercel we fall back to the
 * forwarded host, then to a configured URL.
 */
function getRequestOrigin(request: Request): string {
  const origin = request.headers.get('origin');
  if (origin) return origin.replace(/\/+$/, '');

  const forwardedHost =
    request.headers.get('x-forwarded-host') || request.headers.get('host');
  if (forwardedHost) {
    const proto = request.headers.get('x-forwarded-proto') || 'https';
    return `${proto}://${forwardedHost}`.replace(/\/+$/, '');
  }

  return (
    process.env.NEXT_PUBLIC_CUSTOMER_PORTAL_URL ||
    new URL(request.url).origin
  ).replace(/\/+$/, '');
}

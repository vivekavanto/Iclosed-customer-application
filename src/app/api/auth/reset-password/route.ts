import { NextResponse } from 'next/server';

// Server-to-server proxy to the admin panel's reset-password endpoint.
// Calling it from the browser directly triggers CORS (the admin panel only
// allows certain origins), which is why it failed on dev.iclosed.ca but worked
// on localhost. Proxying through our own origin avoids CORS entirely.
const ADMIN_PANEL_URL =
  process.env.ADMIN_PANEL_URL ?? 'https://iclosed-admin-panel.vercel.app';

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== 'string' || !email.trim()) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    const res = await fetch(
      `${ADMIN_PANEL_URL}/api/admin/reset-password`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      }
    );

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      return NextResponse.json(
        { error: data?.error || 'Something went wrong. Please try again.' },
        { status: res.status }
      );
    }

    // Don't reveal whether the email exists — always return success.
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    );
  }
}

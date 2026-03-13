import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          },
        },
      }
    );

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 401 }
      );
    }

    // Get client record
    const { data: client } = await supabase
      .from("clients")
      .select("id")
      .eq("email", email)
      .single();

    // If client exists, attach leads
    if (client) {
      await supabase
        .from("leads")
        .update({ client_id: client.id })
        .eq("email", email)
        .is("client_id", null);
    }

    // Send welcome email on first login (non-blocking)
    const adminPortalUrl = process.env.NEXT_PUBLIC_ADMIN_PORTAL_URL || "https://iclosed-admin-panel.vercel.app";
    fetch(`${adminPortalUrl}/api/webhooks/new-lead`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => {});

    return NextResponse.json(
      { success: true, user: data.user, client_id: client?.id},
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

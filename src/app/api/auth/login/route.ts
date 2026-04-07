import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { sendWelcomeEmail } from '@/lib/sendWelcomeEmail';

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

    // Use service role client to bypass RLS
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Sync user metadata from leads table if missing
    const userMeta = data.user?.user_metadata;
    if (!userMeta?.first_name) {
      const { data: lead } = await supabaseAdmin
        .from("leads")
        .select("first_name, last_name")
        .eq("email", email)
        .limit(1)
        .single();

      if (lead?.first_name) {
        await supabaseAdmin.auth.admin.updateUserById(data.user!.id, {
          user_metadata: {
            ...userMeta,
            first_name: lead.first_name,
            last_name: lead.last_name ?? "",
            display_name: `${lead.first_name} ${lead.last_name ?? ""}`.trim(),
          },
        });
        console.log("[LOGIN] Synced user metadata from leads table");
      }
    }

    // Get client record
    const { data: client, error: clientError } = await supabaseAdmin
      .from("clients")
      .select("id")
      .eq("email", email)
      .single();

    console.log("[LOGIN] Email:", email);
    console.log("[LOGIN] Client:", client, "Error:", clientError?.message);

    // If client exists, link leads and send welcome email
    if (client) {
      // Link unlinked leads by email
      await supabaseAdmin
        .from("leads")
        .update({ client_id: client.id })
        .eq("email", email)
        .is("client_id", null);

      // Find deals → leads and send welcome email for unsent ones
      const { data: deals, error: dealsErr } = await supabaseAdmin
        .from("deals")
        .select("lead_id")
        .eq("client_id", client.id);

      console.log("[LOGIN] Deals found:", deals, "Error:", dealsErr?.message);

      const leadIds = (deals || []).map((d) => d.lead_id).filter(Boolean);
      console.log("[LOGIN] Lead IDs from deals:", leadIds);

      if (leadIds.length > 0) {
        // Also link client_id via deals
        await supabaseAdmin
          .from("leads")
          .update({ client_id: client.id })
          .in("id", leadIds)
          .is("client_id", null);

        const { data: unsent, error: unsentErr } = await supabaseAdmin
          .from("leads")
          .select("id")
          .in("id", leadIds)
          .eq("welcome_email_sent", false);

        console.log("[LOGIN] Unsent leads:", unsent, "Error:", unsentErr?.message);

        for (const lead of unsent || []) {
          await sendWelcomeEmail(lead.id);
        }
      } else {
        console.log("[LOGIN] No lead IDs found from deals");
      }
    } else {
      console.log("[LOGIN] No client found, skipping welcome email");
    }

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

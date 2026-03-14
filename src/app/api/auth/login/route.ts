import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
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

    // Use service role client to bypass RLS for leads/clients queries
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get client record
    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("id")
      .eq("email", email)
      .single();

    // If client exists, link leads and send welcome email via deals table
    if (client) {
      // Find deals for this client
      const { data: deals, error: dealsError } = await supabaseAdmin
        .from("deals")
        .select("lead_id")
        .eq("client_id", client.id)
        .order("created_at", { ascending: false });

      if (dealsError) {
        console.error("Deals lookup error:", dealsError);
      }

      const leadIds = (deals || []).map((d) => d.lead_id).filter(Boolean);

      // Link client_id on leads found via deals (more reliable than email match)
      if (leadIds.length > 0) {
        const { error: linkError } = await supabaseAdmin
          .from("leads")
          .update({ client_id: client.id })
          .in("id", leadIds)
          .is("client_id", null);

        if (linkError) {
          console.error("Lead client_id link error:", linkError);
        }

        // Get leads where welcome email not yet sent
        const { data: unsent, error: unsentError } = await supabaseAdmin
          .from("leads")
          .select("id, welcome_email_sent")
          .in("id", leadIds)
          .eq("welcome_email_sent", false);

        if (unsentError) {
          console.error("Unsent leads lookup error:", unsentError);
        }

        const adminPortalUrl = process.env.NEXT_PUBLIC_ADMIN_PORTAL_URL || "https://iclosed-admin-panel.vercel.app";

        // Send welcome email for each unsent lead
        for (const lead of unsent || []) {
          try {
            console.log("Sending welcome email for lead:", lead.id);
            const webhookRes = await fetch(`${adminPortalUrl}/api/admin/send-welcome-email`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ lead_id: lead.id }),
            });
            const responseText = await webhookRes.text();
            console.log("Welcome email response:", webhookRes.status, responseText);

            if (webhookRes.ok) {
              const { error: updateError } = await supabaseAdmin
                .from("leads")
                .update({ welcome_email_sent: true })
                .eq("id", lead.id);

              if (updateError) {
                console.error("Failed to update welcome_email_sent:", updateError);
              } else {
                console.log("welcome_email_sent set to true for lead:", lead.id);
              }
            }
          } catch (webhookErr) {
            console.error("Welcome email error for lead:", lead.id, webhookErr);
          }
        }

        if (!unsent || unsent.length === 0) {
          console.log("All welcome emails already sent for client:", client.id);
        }
      } else {
        console.log("No deals found for client:", client.id);
      }
    } else {
      console.log("No client found for email:", email);
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

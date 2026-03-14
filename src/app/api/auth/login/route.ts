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

    // If client exists, attach leads
    if (client) {
      await supabaseAdmin
        .from("leads")
        .update({ client_id: client.id })
        .eq("email", email)
        .is("client_id", null);
    }

    // Find lead for welcome email — first try direct email match on leads table,
    // then fallback: look up via deals table (deals.client_id → deals.lead_id)
    let lead: { id: string; welcome_email_sent: boolean } | null = null;

    // 1. Direct lookup: lead by email
    const { data: directLead, error: leadError } = await supabaseAdmin
      .from("leads")
      .select("id, welcome_email_sent")
      .eq("email", email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (leadError) {
      console.error("Lead lookup error:", leadError);
    }

    lead = directLead;

    // 2. Fallback: if no lead found by email, look through deals → lead_id
    if (!lead && client) {
      const { data: deal } = await supabaseAdmin
        .from("deals")
        .select("lead_id")
        .eq("client_id", client.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (deal?.lead_id) {
        const { data: dealLead } = await supabaseAdmin
          .from("leads")
          .select("id, welcome_email_sent")
          .eq("id", deal.lead_id)
          .maybeSingle();

        lead = dealLead;
      }
    }

    // Send welcome email on first login (uses same endpoint as manual send)
    if (lead && !lead.welcome_email_sent) {
      const adminPortalUrl = process.env.NEXT_PUBLIC_ADMIN_PORTAL_URL || "https://iclosed-admin-panel.vercel.app";
      try {
        const webhookRes = await fetch(`${adminPortalUrl}/api/admin/send-welcome-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lead_id: lead.id }),
        });
        if (webhookRes.ok) {
          // Mark welcome email as sent
          await supabaseAdmin
            .from("leads")
            .update({ welcome_email_sent: true })
            .eq("id", lead.id);
        } else {
          const text = await webhookRes.text();
          console.error("Welcome email failed:", webhookRes.status, text);
        }
      } catch (webhookErr) {
        console.error("Welcome email error:", webhookErr);
      }
    } else if (lead) {
      console.log("Welcome email already sent for lead:", lead.id);
    } else {
      console.log("No lead found for email:", email);
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

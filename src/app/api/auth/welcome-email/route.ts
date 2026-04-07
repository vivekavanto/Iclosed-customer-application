import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { sendWelcomeEmail } from "@/lib/sendWelcomeEmail";

/**
 * POST /api/auth/welcome-email
 *
 * Sends welcome email for the currently logged-in user.
 * Looks up client → deals → leads and sends welcome email
 * for any leads where welcome_email_sent is false.
 */
export async function POST() {
  try {
    const cookieStore = await cookies();

    // Get the current user from session
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

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const email = user.email;

    // Use service role to bypass RLS
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

    if (!client) {
      console.log("[Welcome Email] No client found for email:", email);
      return NextResponse.json({ success: true, message: "No client found" });
    }

    // Link any unlinked leads by email
    await supabaseAdmin
      .from("leads")
      .update({ client_id: client.id })
      .eq("email", email)
      .is("client_id", null);

    // Find deals for this client
    const { data: deals, error: dealsError } = await supabaseAdmin
      .from("deals")
      .select("lead_id")
      .eq("client_id", client.id)
      .order("created_at", { ascending: false });

    if (dealsError) {
      console.error("[Welcome Email] Deals lookup error:", dealsError);
      return NextResponse.json({ success: true, message: "Deals lookup failed" });
    }

    const leadIds = (deals || []).map((d) => d.lead_id).filter(Boolean);

    if (leadIds.length === 0) {
      console.log("[Welcome Email] No deals found for client:", client.id);
      return NextResponse.json({ success: true, message: "No deals found" });
    }

    // Link client_id on leads found via deals
    await supabaseAdmin
      .from("leads")
      .update({ client_id: client.id })
      .in("id", leadIds)
      .is("client_id", null);

    // Get leads where welcome email not yet sent
    const { data: unsent } = await supabaseAdmin
      .from("leads")
      .select("id")
      .in("id", leadIds)
      .eq("welcome_email_sent", false);

    if (!unsent || unsent.length === 0) {
      console.log("[Welcome Email] All emails already sent for client:", client.id);
      return NextResponse.json({ success: true, message: "Already sent" });
    }

    let sentCount = 0;

    for (const lead of unsent) {
      const sent = await sendWelcomeEmail(lead.id);
      if (sent) sentCount++;
    }

    return NextResponse.json({
      success: true,
      message: `Sent ${sentCount} welcome email(s)`,
    });
  } catch (err: any) {
    console.error("[Welcome Email] Server error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

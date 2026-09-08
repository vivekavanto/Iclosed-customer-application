import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { sendWelcomeEmail } from '@/lib/sendWelcomeEmail';
import { notifyAdminActivation } from '@/lib/notifyAdminActivation';
import { sessionDeadlineCookie } from '@/lib/sessionPolicy';

/**
 * Supabase's raw auth errors are written for developers ("Invalid login
 * credentials"), and they are shown verbatim on the login form. Translate the
 * ones a client can actually hit into something that tells them what to do.
 * Anything unrecognised falls through unchanged rather than being flattened
 * into a generic message that would hide a real fault.
 */
function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();

  if (m.includes("invalid login credentials")) {
    return "The email or password you entered is incorrect. Please check and try again.";
  }
  if (m.includes("email not confirmed")) {
    return "Your account isn't activated yet. Please open the activation link we emailed you to set your password.";
  }
  if (m.includes("too many requests") || m.includes("rate limit")) {
    return "Too many sign-in attempts. Please wait a minute and try again.";
  }
  return message;
}

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
        { error: friendlyAuthError(error.message) },
        { status: 401 }
      );
    }

    // Use service role client to bypass RLS
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // ── Portal gate ────────────────────────────────────────────────────────
    // A valid Supabase credential is NOT by itself permission to use the
    // CLIENT portal. Staff accounts live in `admin_users` and have no client
    // file at all, and before this gate they signed in here perfectly happily:
    // this route returned success, the login page sent them to /retainer, and
    // they landed on a blank but signable retainer form reading "Address not
    // available / Transaction Type: N/A".
    //
    // Nothing downstream caught it. getAuthClient() *correctly* refuses to
    // resolve an admin_users email, so every portal API answered 401 — but a
    // 401 that isn't flagged by the middleware is not treated as a session
    // expiry (see IdleLogoutGuard.isSessionExpiry), so the failure was silent.
    // The account must therefore be turned away at the door.
    //
    // signInWithPassword has already written the session cookies, so a refused
    // account MUST be signed out here or it keeps a usable portal session.
    const normalizedEmail = email.trim();

    const { data: adminRow } = await supabaseAdmin
      .from("admin_users")
      .select("id")
      .ilike("email", normalizedEmail)
      .maybeSingle();

    if (adminRow) {
      await supabase.auth.signOut();
      return NextResponse.json(
        {
          error:
            "This is a staff account. The client portal is for clients only — please sign in through the admin app.",
        },
        { status: 403 }
      );
    }

    // No portal identity of any kind: no client record reachable by either link
    // getAuthClient() uses, and no lead carrying this email. Deliberately an
    // AND — a client whose email later changed still matches on auth_user_id,
    // and an invited client always has the lead the invite was sent from — so
    // this only rejects an account with genuinely nothing behind it.
    // Three separate `.eq`/`.ilike` filters rather than one `.or(...)`: an `or`
    // expression is built by string interpolation, and the email it would carry
    // comes straight off the request body. PostgREST parses commas and parens
    // inside that expression, so a crafted address could reshape the filter.
    const [{ data: clientByEmail }, { data: clientByAuthId }, { data: leadRows }] =
      await Promise.all([
        supabaseAdmin
          .from("clients")
          .select("id")
          .ilike("email", normalizedEmail)
          .limit(1),
        supabaseAdmin
          .from("clients")
          .select("id")
          .eq("auth_user_id", data.user!.id)
          .limit(1),
        supabaseAdmin
          .from("leads")
          .select("id")
          .ilike("email", normalizedEmail)
          .limit(1),
      ]);

    if (
      !clientByEmail?.length &&
      !clientByAuthId?.length &&
      !leadRows?.length
    ) {
      await supabase.auth.signOut();
      return NextResponse.json(
        {
          error:
            "We couldn't find a client file for this email. If you're an iClosed client, please use the link we emailed you, or contact your iClosed advisor.",
        },
        { status: 403 }
      );
    }

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
      // Notify the admin app that this client has activated (successful login).
      // The admin activate-deal webhook flips their Inactive deals to Active AND
      // sends the one-off "your client just signed up" email to the referral
      // agent/broker. Best-effort, time-boxed and idempotent on the admin side.
      // Note this is a BACKSTOP: the primary trigger is /api/auth/activated,
      // fired the moment the client sets their password.
      await notifyAdminActivation(email, "LOGIN");

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
        .eq("client_id", client.id)
        .eq("is_deleted", false);

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

    const response = NextResponse.json(
      { success: true, user: data.user, client_id: client?.id},
      { status: 200 }
    );

    // Start the absolute session clock. Middleware enforces this deadline on
    // every subsequent request, so a session ends a fixed 3h after login no
    // matter how active the user is or how often the token gets refreshed.
    const deadline = sessionDeadlineCookie(Date.now());
    response.cookies.set(deadline.name, deadline.value, deadline.options);

    return response;
  } catch (err) {
    console.error('[LOGIN] Server error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

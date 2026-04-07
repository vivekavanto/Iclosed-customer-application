import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import supabaseAdmin from "./supabaseAdmin";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Gets the authenticated Supabase user from the server-side session (cookie).
 * Returns null if no session OR if env vars are missing (falls back to lead_id flow).
 */
export async function getAuthUser() {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn(
      "[getAuthClient] NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY missing — skipping auth check"
    );
    return null;
  }

  try {
    const cookieStore = await cookies();

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
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
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user ?? null;
  } catch (err) {
    console.warn("[getAuthClient] Auth check failed (non-blocking):", err);
    return null;
  }
}

/**
 * Gets the client record for the authenticated user.
 *
 * FIX: Three-step lookup so a client is always found even when
 * auth_user_id was never written (common when admin converts a lead
 * that had no prior session, or when the invite flow ran but the
 * back-fill UPDATE silently failed).
 *
 * Step 1 — match by auth_user_id (fastest, normal path)
 * Step 2 — match by email (catches un-linked clients)
 *           → back-fills auth_user_id so Step 1 works next time
 * Step 3 — create a minimal client row so the user is never stuck
 *           with a blank dashboard after accepting an invite
 *
 * Returns null only if the user is not authenticated at all.
 */
export async function getAuthClient() {
  const user = await getAuthUser();
  if (!user) return null;

  // ── Step 1: match by auth_user_id ────────────────────────────────────────
  const { data: clientsByAuthId } = await supabaseAdmin
    .from("clients")
    .select("id, email, first_name, last_name, phone, auth_user_id")
    .eq("auth_user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1);

  if (clientsByAuthId && clientsByAuthId.length > 0) {
    const client = clientsByAuthId[0];

    // Self-heal: if the client's email doesn't match the auth user's email,
    // this is a co-purchaser whose auth_user_id was incorrectly set on the
    // primary purchaser's client during conversion. Remove it and fall through
    // so we can find/create the correct client.
    if (
      user.email &&
      client.email?.toLowerCase().trim() !== user.email.toLowerCase().trim()
    ) {
      console.log(
        `[getAuthClient] Email mismatch: client ${client.id} (${client.email}) vs auth user (${user.email}) — detaching auth_user_id`
      );
      await supabaseAdmin
        .from("clients")
        .update({ auth_user_id: null })
        .eq("id", client.id)
        .eq("auth_user_id", user.id);
      // Fall through to Step 2+
    } else {
      return client;
    }
  }

  // ── Step 2: match by email ────────────────────────────────────────────────
  // Handles the case where the client row exists (created during lead
  // conversion) but auth_user_id was never written back to it.
  if (user.email) {
    const { data: clientsByEmail } = await supabaseAdmin
      .from("clients")
      .select("id, email, first_name, last_name, phone, auth_user_id")
      .ilike("email", user.email.trim())
      .order("created_at", { ascending: false })
      .limit(1);

    if (clientsByEmail && clientsByEmail.length > 0) {
      const client = clientsByEmail[0];

      // Back-fill auth_user_id so future requests hit Step 1 directly
      if (!client.auth_user_id || client.auth_user_id !== user.id) {
        await supabaseAdmin
          .from("clients")
          .update({ auth_user_id: user.id })
          .eq("id", client.id);

        console.log(
          `[getAuthClient] Back-filled auth_user_id for client ${client.id} (${client.email})`
        );
      }

      // Self-heal: ensure leads + deals with this email point to this client.
      // Fixes co-purchasers from intake whose leads still have the parent's client_id.
      const { data: mismatchedLeads } = await supabaseAdmin
        .from("leads")
        .select("id")
        .ilike("email", user.email.trim())
        .neq("client_id", client.id);

      if (mismatchedLeads && mismatchedLeads.length > 0) {
        const leadIds = mismatchedLeads.map((l) => l.id);

        await supabaseAdmin
          .from("leads")
          .update({ client_id: client.id })
          .in("id", leadIds);

        await supabaseAdmin
          .from("deals")
          .update({ client_id: client.id })
          .in("lead_id", leadIds);

        console.log(
          `[getAuthClient] Re-linked ${leadIds.length} mismatched lead(s) + deals to client ${client.id}`
        );
      }

      return client;
    }
  }

  // ── Step 3: no client row found — check leads for an existing client ─────
  // Before creating a brand-new client, check if any lead with the same
  // email already points to a client record. This avoids creating orphan
  // duplicates when the client's email in the clients table differs slightly
  // from the auth email (e.g. casing, whitespace).
  if (user.email) {
    const { data: leadWithClient } = await supabaseAdmin
      .from("leads")
      .select("client_id")
      .ilike("email", user.email.trim())
      .not("client_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1);

    if (leadWithClient && leadWithClient.length > 0) {
      const existingClientId = leadWithClient[0].client_id;

      // Verify the client's email matches — if it doesn't, this lead is a
      // co-purchaser sharing the parent's client_id. Skip and create own client.
      const { data: linkedClient } = await supabaseAdmin
        .from("clients")
        .select("id, email, first_name, last_name, phone, auth_user_id")
        .eq("id", existingClientId)
        .single();

      if (
        linkedClient &&
        linkedClient.email?.toLowerCase().trim() === user.email.toLowerCase().trim()
      ) {
        // Back-fill auth_user_id on the existing client
        if (!linkedClient.auth_user_id) {
          await supabaseAdmin
            .from("clients")
            .update({ auth_user_id: user.id })
            .eq("id", existingClientId);
        }

        console.log(
          `[getAuthClient] Linked auth user to existing client ${existingClientId} via lead email`
        );
        return linkedClient;
      }
      // Email mismatch — co-purchaser sharing parent's client. Fall through.
    }

    // ── Step 4: create own client + fix lead/deal linkage ─────────────────
    console.log(
      `[getAuthClient] Creating own client for auth user ${user.id} (${user.email})`
    );

    const nameParts = (
      user.user_metadata?.display_name ||
      user.user_metadata?.full_name ||
      ""
    )
      .trim()
      .split(" ");

    const first_name =
      user.user_metadata?.first_name || nameParts[0] || "";
    const last_name =
      user.user_metadata?.last_name ||
      nameParts.slice(1).join(" ") ||
      "";

    const { data: newClient, error: createErr } = await supabaseAdmin
      .from("clients")
      .insert({
        email: user.email,
        first_name,
        last_name,
        auth_user_id: user.id,
      })
      .select("id, email, first_name, last_name, phone, auth_user_id")
      .single();

    if (createErr) {
      console.error(
        "[getAuthClient] Failed to create fallback client record:",
        createErr.message
      );
      return null;
    }

    // Self-heal: update leads + deals with this email to point to the new client
    if (newClient) {
      const { data: userLeads } = await supabaseAdmin
        .from("leads")
        .select("id")
        .ilike("email", user.email.trim());

      if (userLeads && userLeads.length > 0) {
        const leadIds = userLeads.map((l) => l.id);

        await supabaseAdmin
          .from("leads")
          .update({ client_id: newClient.id })
          .in("id", leadIds);

        await supabaseAdmin
          .from("deals")
          .update({ client_id: newClient.id })
          .in("lead_id", leadIds);

        console.log(
          `[getAuthClient] Re-linked ${leadIds.length} lead(s) + their deals to new client ${newClient.id}`
        );
      }
    }

    return newClient;
  }

  return null;
}

/**
 * Gets the latest active deal for the authenticated client.
 * Returns { client, deal } or null if no deal / not authenticated.
 */
export async function getAuthClientDeal() {
  const client = await getAuthClient();
  if (!client) return null;

  const { data: deal } = await supabaseAdmin
    .from("deals")
    .select(
      "id, file_number, type, status, closing_date, property_address, price, lead_id"
    )
    .eq("client_id", client.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return { client, deal: deal ?? null };
}

/**
 * Gets ALL deals for the authenticated client.
 * Returns { client, deals[] } or null if not authenticated.
 */
export async function getAuthClientDeals() {
  const client = await getAuthClient();
  if (!client) return null;

  const { data: deals } = await supabaseAdmin
    .from("deals")
    .select(
      "id, file_number, type, status, closing_date, property_address, price, lead_id"
    )
    .eq("client_id", client.id)
    .order("created_at", { ascending: false });

  return { client, deals: deals ?? [] };
}
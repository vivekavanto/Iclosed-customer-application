import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import supabaseAdmin from "./supabaseAdmin";
import { findClientByName, followMergedClient } from "./clientNames";

const SELECT_COLS =
  "id, email, first_name, last_name, phone, auth_user_id, merged_into_client_id";

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

  type ResolvedClient = {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    phone: string | null;
    auth_user_id: string | null;
    merged_into_client_id?: string | null;
  };
  let resolvedClient: ResolvedClient | null = null;

  // ── Step 1: match by auth_user_id ────────────────────────────────────────
  const { data: clientsByAuthId } = await supabaseAdmin
    .from("clients")
    .select(SELECT_COLS)
    .eq("auth_user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1);

  if (clientsByAuthId && clientsByAuthId.length > 0) {
    const client = clientsByAuthId[0];

    // Self-heal: if the client's email doesn't match the auth user's email,
    // this is a co-purchaser whose auth_user_id was incorrectly set on the
    // primary purchaser's client during conversion. Remove it and fall through.
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
      resolvedClient = client;
    }
  }

  // ── Step 2: match by email ────────────────────────────────────────────────
  if (!resolvedClient && user.email) {
    const { data: clientsByEmail } = await supabaseAdmin
      .from("clients")
      .select(SELECT_COLS)
      .ilike("email", user.email.trim())
      .is("merged_into_client_id", null)
      .order("created_at", { ascending: false })
      .limit(1);

    if (clientsByEmail && clientsByEmail.length > 0) {
      resolvedClient = clientsByEmail[0];

      // Back-fill auth_user_id so future requests hit Step 1 directly
      if (!resolvedClient.auth_user_id || resolvedClient.auth_user_id !== user.id) {
        await supabaseAdmin
          .from("clients")
          .update({ auth_user_id: user.id })
          .eq("id", resolvedClient.id);
      }
    }
  }

  // ── Step 2b: match by display name (primary or alias) ────────────────────
  // If the user changed their email so they don't match Step 2, fall back to
  // the name they signed up with (matched against current name + aliases).
  if (!resolvedClient) {
    const displayName = (
      user.user_metadata?.display_name ||
      user.user_metadata?.full_name ||
      ""
    ).trim();
    const metaFirst = (user.user_metadata?.first_name as string | undefined) ?? "";
    const metaLast = (user.user_metadata?.last_name as string | undefined) ?? "";
    let first = metaFirst;
    let last = metaLast;
    if (!first && !last && displayName) {
      const parts = displayName.split(" ");
      first = parts[0] ?? "";
      last = parts.slice(1).join(" ");
    }
    if (first || last) {
      const byName = await findClientByName(first, last);
      if (byName) {
        const { data: full } = await supabaseAdmin
          .from("clients")
          .select(SELECT_COLS)
          .eq("id", byName.id)
          .maybeSingle();
        if (full) {
          resolvedClient = full as ResolvedClient;
          // Back-fill auth_user_id so future requests hit Step 1 directly
          if (!resolvedClient.auth_user_id || resolvedClient.auth_user_id !== user.id) {
            await supabaseAdmin
              .from("clients")
              .update({ auth_user_id: user.id })
              .eq("id", resolvedClient.id);
          }
        }
      }
    }
  }

  // ── Step 3: check leads for an existing client ───────────────────────────
  if (!resolvedClient && user.email) {
    const { data: leadWithClient } = await supabaseAdmin
      .from("leads")
      .select("client_id")
      .ilike("email", user.email.trim())
      .not("client_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1);

    if (leadWithClient && leadWithClient.length > 0) {
      const existingClientId = leadWithClient[0].client_id;

      const { data: linkedClient } = await supabaseAdmin
        .from("clients")
        .select(SELECT_COLS)
        .eq("id", existingClientId)
        .single();

      // Only use this client if emails match — otherwise it's the parent's client
      if (
        linkedClient &&
        linkedClient.email?.toLowerCase().trim() === user.email.toLowerCase().trim()
      ) {
        if (!linkedClient.auth_user_id) {
          await supabaseAdmin
            .from("clients")
            .update({ auth_user_id: user.id })
            .eq("id", existingClientId);
        }
        resolvedClient = linkedClient;
      }
    }
  }

  // ── Step 4: create own client ────────────────────────────────────────────
  if (!resolvedClient && user.email) {
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
      .select(SELECT_COLS)
      .single();

    if (createErr) {
      console.error(
        "[getAuthClient] Failed to create fallback client record:",
        createErr.message
      );
      return null;
    }

    resolvedClient = newClient as ResolvedClient;
  }

  // ── Follow merged_into_client_id so a merged secondary always returns the primary
  if (resolvedClient?.merged_into_client_id) {
    const primary = await followMergedClient(resolvedClient.merged_into_client_id);
    if (primary) {
      const { data: full } = await supabaseAdmin
        .from("clients")
        .select(SELECT_COLS)
        .eq("id", primary.id)
        .maybeSingle();
      if (full) resolvedClient = full as ResolvedClient;
    }
  }

  // ── Self-heal: ensure ALL leads with this email point to the resolved client
  // This runs regardless of which step found the client, so new co-purchaser
  // leads from intake always get re-linked on next dashboard visit.
  if (resolvedClient && user.email) {
    const { data: mismatchedLeads } = await supabaseAdmin
      .from("leads")
      .select("id")
      .ilike("email", user.email.trim())
      .neq("client_id", resolvedClient.id);

    if (mismatchedLeads && mismatchedLeads.length > 0) {
      const leadIds = mismatchedLeads.map((l) => l.id);

      await supabaseAdmin
        .from("leads")
        .update({ client_id: resolvedClient.id })
        .in("id", leadIds);

      await supabaseAdmin
        .from("deals")
        .update({ client_id: resolvedClient.id })
        .in("lead_id", leadIds);

      console.log(
        `[getAuthClient] Re-linked ${leadIds.length} mismatched lead(s) + deals to client ${resolvedClient.id}`
      );
    }
  }

  return resolvedClient;
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
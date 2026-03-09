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
  // If env vars missing, skip auth silently — dashboard will use lead_id fallback
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn("[getAuthClient] NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY missing — skipping auth check");
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

    const { data: { user } } = await supabase.auth.getUser();
    return user ?? null;
  } catch (err) {
    console.warn("[getAuthClient] Auth check failed (non-blocking):", err);
    return null;
  }
}

/**
 * Gets the client record for the authenticated user.
 * Returns null if not found or not authenticated.
 */
export async function getAuthClient() {
  const user = await getAuthUser();
  if (!user) return null;

  const { data: client } = await supabaseAdmin
    .from("clients")
    .select("id, email, first_name, last_name")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  return client ?? null;
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
    .select("id, file_number, type, status, closing_date, property_address, price, lead_id")
    .eq("client_id", client.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return { client, deal: deal ?? null };
}

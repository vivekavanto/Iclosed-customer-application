import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import supabaseAdmin from "./supabaseAdmin";

/**
 * Gets the authenticated Supabase user from the server-side session (cookie).
 * Returns null if no session.
 */
export async function getAuthUser() {
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

  const { data: { user } } = await supabase.auth.getUser();
  return user ?? null;
}

/**
 * Gets the client record for the authenticated user.
 * Looks up clients table WHERE auth_user_id = user.id.
 * Returns null if not found.
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
 * Returns { client, deal } or null if no deal exists.
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

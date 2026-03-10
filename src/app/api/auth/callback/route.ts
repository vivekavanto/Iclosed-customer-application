import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "/dashboard";
  const origin = requestUrl.origin;

  console.log(`[Auth Callback] URL: ${request.url}`);
  console.log(`[Auth Callback] Code present: ${!!code}, Next: ${next}`);

  if (code) {
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

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (!error) {
      console.log(`[Auth Callback] Success! Redirecting to ${next}`);
      return NextResponse.redirect(`${origin}${next}`);
    } else {
      console.error(`[Auth Callback] Exchange Error: ${error.message}`);
      return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`);
    }
  }

  // If no code, check if there are error parameters in the search (some flows do this)
  const errorCode = requestUrl.searchParams.get("error_code");
  const errorDescription = requestUrl.searchParams.get("error_description");

  if (errorCode || errorDescription) {
     console.error(`[Auth Callback] Supabase Error: ${errorCode} - ${errorDescription}`);
     return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(errorDescription || "Authentication failed")}`);
  }

  console.warn("[Auth Callback] No code or error found in search params.");
  return NextResponse.redirect(`${origin}/login?error=Invalid+magic+link`);
}

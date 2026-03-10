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

  // If there's no code, it might be an implicit flow (hash fragment like #access_token=...)
  // We return a simple HTML snippet to parse the hash safely on the client.
  return new NextResponse(
    `<html>
      <head><title>Authenticating...</title></head>
      <body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;background:#fafafa;">
        <div style="text-align:center;">
          <div style="width:40px;height:40px;border:3px solid #e5e7eb;border-top-color:#c0392b;border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 16px;"></div>
          <p style="color:#64748b;font-size:14px;font-weight:600;">Verifying secure link...</p>
        </div>
        <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
        <script>
          const hash = window.location.hash;
          if (hash && hash.includes("access_token")) {
             // Pass the hash fragment exactly as-is to the set-password page where AuthHashHandler runs
             window.location.replace("${next}" + hash);
          } else {
             // Check if there's an error in the query parameters from the backend redirect
             const searchParams = new URLSearchParams(window.location.search);
             const errCode = searchParams.get("error_code");
             const errDesc = searchParams.get("error_description");
             if (errCode || errDesc) {
                 window.location.replace("/login?error=" + encodeURIComponent(errDesc || "Authentication failed"));
             } else {
                 window.location.replace("/login?error=Invalid+magic+link");
             }
          }
        </script>
      </body>
    </html>`,
    {
      headers: { "Content-Type": "text/html" }
    }
  );
}

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: any[])  {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Paths that must stay reachable WITHOUT a Hawlai login — real
  // customers/influencers/affiliates visiting these are never
  // expected to have an account. Previously only "/" and "/auth/*"
  // were exempted, which meant the storefront (/p/*), the public
  // Open Collabs board, the affiliate apply/track pages, and their
  // API routes were silently redirecting every real, logged-out
  // visitor to /auth/login — invisible while testing logged-in as
  // the business owner, but broken for the actual public audience
  // these pages exist for.
  const PUBLIC_PATH_PREFIXES = [
    "/auth",
    "/p/", // legacy storefront route (landing_pages table)
    "/site/", // current storefront route (websites/website_pages tables) — the one the Website Builder actually generates and publishes
    "/collabs",
    "/affiliates",
    "/admin-seed-knowledge", // page itself, protected by its own secret header, not user auth
    "/api/admin/", // API routes for the above (and similar) — also secret-header protected, not user-session protected
    "/api/public/",
    "/book/", // customer appointment booking, no account needed
    "/report/", // shareable client report links (get_report_links tool) — the client viewing it never has a Hawlai account
    "/invite/", // team invite acceptance — the invitee doesn't have an account yet when they click this
    "/seo/", // published SEO content pages, meant to be publicly indexed by Google
  ];
  const isPublicPath =
    request.nextUrl.pathname === "/" ||
    PUBLIC_PATH_PREFIXES.some((prefix) => request.nextUrl.pathname.startsWith(prefix));
  const isAuthRoute = request.nextUrl.pathname.startsWith("/auth");

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

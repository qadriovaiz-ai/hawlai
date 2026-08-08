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
    "/p/", // storefront product pages
    "/collabs",
    "/affiliates",
    "/admin-seed-knowledge", // protected by its own secret header, not user auth
    "/api/public/",
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

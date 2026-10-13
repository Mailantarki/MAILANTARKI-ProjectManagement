import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicEnv } from "./lib/env";
import { contentSecurityPolicy } from "./lib/security/csp";

export async function proxy(request: NextRequest) {
  const env = getPublicEnv();
  const nonce = crypto.randomUUID().replaceAll("-", "");
  const csp = contentSecurityPolicy({ nonce, development: process.env.NODE_ENV === "development",
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  let response = NextResponse.next({ request: { headers: requestHeaders } });

  // Refresh the Supabase session on every signed-in area. Server Components cannot write cookies,
  // so without this an expired token is refreshed (and not saved) on every admin request.
  const path = request.nextUrl.pathname;

  // Email links (password reset, invites) must reach /auth/confirm. When Supabase does not accept
  // the redirect URL it falls back to the Site URL, so the link lands on "/" (the sign-in page)
  // with ?code= or ?error_code= and the reset form never opens. Forward those here.
  const params = request.nextUrl.searchParams;
  if (path !== "/auth/confirm") {
    if (params.has("code") || (params.has("token_hash") && params.has("type"))) {
      const target = new URL("/auth/confirm", request.url);
      for (const key of ["code", "token_hash", "type", "next"]) {
        const value = params.get(key);
        if (value) target.searchParams.set(key, value);
      }
      return NextResponse.redirect(target);
    }
    if (params.has("error_code") && /otp|expired|access_denied/i.test(`${params.get("error_code")} ${params.get("error")}`)) {
      return NextResponse.redirect(new URL("/forgot-password?expired=1", request.url));
    }
  }
  if (["/projects", "/admin", "/change-password"].some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    const client = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (items, headers) => {
          for (const item of items) request.cookies.set(item.name, item.value);
          requestHeaders.set("cookie", request.cookies.toString());
          response = NextResponse.next({ request: { headers: requestHeaders } });
          for (const item of items) response.cookies.set(item.name, item.value, item.options);
          for (const [name, value] of Object.entries(headers ?? {})) response.headers.set(name, value);
        },
      },
    });
    // Only refreshes an expired token and saves the new cookies; no network call otherwise.
    // Authorization happens in getPrincipal(), which verifies the token.
    await client.auth.getSession();
    response.headers.set("Cache-Control", "private, no-store");
  }
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};

import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { getUserClient } from "@/lib/supabase/server";

// Only internal destinations that make sense after an email link.
const allowedNext = new Set(["/reset-password", "/projects"]);

/** Landing for Supabase email links: PKCE `code` (default template) or `token_hash` (custom template). */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  // Password recovery is the only email flow today, so it is the default destination.
  const next = allowedNext.has(url.searchParams.get("next") ?? "") ? url.searchParams.get("next")! : "/reset-password";
  const client = await getUserClient();
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const { error } = code
    ? await client.auth.exchangeCodeForSession(code)
    : tokenHash && type ? await client.auth.verifyOtp({ type, token_hash: tokenHash })
      : { error: new Error("Missing token") };
  const target = new URL(error ? "/forgot-password?expired=1" : next, url.origin);
  const response = NextResponse.redirect(target);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

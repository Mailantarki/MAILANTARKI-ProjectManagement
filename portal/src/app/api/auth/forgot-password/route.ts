import { z } from "zod";
import { getUserClient } from "../../../../lib/supabase/server";
import { requestIp, reserveAttempt, tooMany } from "../../../../lib/auth/rate-limit";
import { sameOrigin } from "../../../../lib/auth/origin";

const input = z.object({ email: z.email().max(320) }).strict();
const headers = { "Cache-Control": "no-store" };
// Same answer whether or not the account exists, so the form cannot be used to discover emails.
const accepted = () => Response.json({ ok: true }, { headers });

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Invalid request" }, { status: 403, headers });
  // Shares the sign-in budget (5 attempts per IP every 15 minutes); a reset request is never "released".
  if (await reserveAttempt("login", requestIp(request)) === null) return tooMany();
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Enter a valid email address" }, { status: 400, headers });
  const origin = new URL(request.url).origin;
  const client = await getUserClient();
  const { error } = await client.auth.resetPasswordForEmail(parsed.data.email, {
    // Must be listed in Supabase Auth → URL Configuration → Redirect URLs (exact match, no query string).
    redirectTo: `${origin}/auth/confirm`,
  });
  if (error) console.error("Password reset email failed", error.status ?? "", error.code ?? "");
  return accepted();
}

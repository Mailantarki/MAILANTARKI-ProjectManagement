import { z } from "zod";
import { getUserClient } from "../../../../lib/supabase/server";
import { reserveAttempt, releaseAttempt, requestIp, tooMany } from "../../../../lib/auth/rate-limit";
import { sameOrigin } from "../../../../lib/auth/origin";
import { logAccess } from "../../../../lib/auth/log";

const input = z.object({ email: z.email().max(320), password: z.string().min(1).max(1024) }).strict();
const denied = () => Response.json({ error: "Invalid email or password" },
  { status: 401, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Invalid request" }, { status: 403 });
  const ip = requestIp(request);
  const attemptId = await reserveAttempt("login", ip);
  if (attemptId === null) return tooMany();
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return denied();
  const client = await getUserClient();
  const { data, error } = await client.auth.signInWithPassword(parsed.data);
  if (error || !data.user) return denied();
  const { data: profile } = await client.from("profiles")
    .select("organization_id").eq("id", data.user.id).maybeSingle();
  if (!profile) { await client.auth.signOut(); return denied(); }
  try {
  await logAccess(request, { action: "login", user_id: data.user.id, organization_id: profile.organization_id });
  await releaseAttempt(attemptId);
  } catch {
    await client.auth.signOut();
    return Response.json({ error: "Sign in unavailable" }, { status: 503 });
  }
  return Response.json({ redirectTo: "/projects" }, { headers: { "Cache-Control": "no-store" } });
}

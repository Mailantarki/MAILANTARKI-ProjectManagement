import { cookies } from "next/headers";
import { z } from "zod";
import { redeemCode } from "../../../../lib/access-codes/redeem";
import { createVisitorSession, visitorExpiresAt } from "../../../../lib/access-codes/session";
import { reserveAttempt, releaseAttempt, requestIp, tooMany } from "../../../../lib/auth/rate-limit";
import { sameOrigin } from "../../../../lib/auth/origin";
import { logAccess } from "../../../../lib/auth/log";

const input = z.object({ code: z.string().min(10).max(32).regex(/^[a-zA-Z0-9-]+$/) }).strict();
const denied = () => Response.json({ error: "Invalid or expired code" },
  { status: 401, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Invalid request" }, { status: 403 });
  const ip = requestIp(request);
  const attemptId = await reserveAttempt("code", ip);
  if (attemptId === null) return tooMany();
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return denied();
  const result = await redeemCode(parsed.data.code);
  if (!result) return denied();
  const expiresAt = visitorExpiresAt(result.expires_at);
  try {
    await logAccess(request, { action: "code_redeem", access_code_id: result.id, organization_id: result.organization_id });
    await releaseAttempt(attemptId);
  } catch { return Response.json({ error: "Access unavailable" }, { status: 503 }); }
  const token = await createVisitorSession(result.id, expiresAt);
  (await cookies()).set("visitor_session", token, {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", expires: new Date(expiresAt),
  });
  return Response.json({ redirectTo: "/projects" }, { headers: { "Cache-Control": "no-store" } });
}

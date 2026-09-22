import "server-only";
import { getAdminClient } from "../supabase/admin";
import { isIP } from "node:net";

export function requestIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const candidate = forwarded || request.headers.get("x-real-ip") || "127.0.0.1";
  return isIP(candidate) ? candidate : "127.0.0.1";
}
export async function reserveAttempt(kind: "login" | "code", ip: string): Promise<number | null> {
  const { data, error } = await getAdminClient().rpc("reserve_auth_attempt", { p_kind: kind, p_ip: ip });
  if (error) throw error;
  return data === null ? null : Number(data);
}
export async function releaseAttempt(id: number) {
  const { error } = await getAdminClient().from("auth_attempts").delete().eq("id", id);
  if (error) throw error;
}
export function tooMany() {
  return Response.json({ error: "Too many attempts. Try again later." },
    { status: 429, headers: { "Retry-After": "900", "Cache-Control": "no-store" } });
}

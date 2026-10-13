import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { getServerEnv } from "../env";

const key = () => new TextEncoder().encode(getServerEnv().VISITOR_SESSION_SECRET);
export function visitorExpiresAt(codeExpiresAt: string | null) {
  return Math.min(Date.now() + 8 * 60 * 60 * 1000, codeExpiresAt ? new Date(codeExpiresAt).getTime() : Infinity);
}
export async function createVisitorSession(accessCodeId: string, expiresAt: number) {
  return new SignJWT({ sid: accessCodeId }).setProtectedHeader({ alg: "HS256" })
    .setIssuedAt().setExpirationTime(Math.floor(expiresAt / 1000)).sign(key());
}
export async function readVisitorSession(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    return typeof payload.sid === "string" && /^[0-9a-f-]{36}$/i.test(payload.sid) ? payload.sid : null;
  } catch { return null; }
}

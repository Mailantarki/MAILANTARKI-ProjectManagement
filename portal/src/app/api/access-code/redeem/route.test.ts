import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ failures: 0, result: null as null | { id: string; expires_at: string | null; organization_id: string }, cookie: null as null | { name: string; value: string; options: Record<string, unknown> }, logs: 0 }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: (name: string, value: string, options: Record<string, unknown>) => { state.cookie = { name, value, options }; } }) }));
vi.mock("../../../../lib/auth/rate-limit", () => ({
  requestIp: () => "127.0.0.1",
  reserveAttempt: async () => state.failures < 5 ? ++state.failures : null,
  releaseAttempt: async () => { state.failures--; },
  tooMany: () => Response.json({ error: "Too many attempts. Try again later." }, { status: 429, headers: { "Retry-After": "900" } }),
}));
vi.mock("../../../../lib/access-codes/redeem", () => ({ redeemCode: async () => state.result }));
vi.mock("../../../../lib/access-codes/session", () => ({
  visitorExpiresAt: (expires: string | null) => Math.min(Date.now() + 8 * 3600_000, expires ? Date.parse(expires) : Infinity),
  createVisitorSession: async () => "signed-token",
}));
vi.mock("../../../../lib/auth/log", () => ({ logAccess: async () => { state.logs++; } }));

import { POST } from "./route";
const request = () => new Request("http://localhost/api/access-code/redeem", {
  method: "POST", headers: { origin: "http://localhost", host: "localhost", "content-type": "application/json" },
  body: JSON.stringify({ code: "ABCDE-23456" }),
});

describe("access code redemption", () => {
  beforeEach(() => { state.failures = 0; state.result = null; state.cookie = null; state.logs = 0; });
  it("sets a restricted visitor cookie for a valid code", async () => {
    state.result = { id: "code-id", organization_id: "org-id", expires_at: null };
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(state.cookie?.name).toBe("visitor_session");
    expect(state.cookie?.options).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/" });
    expect(state.logs).toBe(1);
  });
  it("gives the same generic response for invalid, expired, revoked, and exhausted codes", async () => {
    const messages = [];
    for (let i = 0; i < 4; i++) messages.push(await (await POST(request())).json());
    expect(new Set(messages.map((message) => JSON.stringify(message))).size).toBe(1);
    expect(messages[0]).toEqual({ error: "Invalid or expired code" });
  });
  it("returns 429 on a sixth failed attempt", async () => {
    for (let i = 0; i < 5; i++) expect((await POST(request())).status).toBe(401);
    const response = await POST(request());
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("900");
  });
});

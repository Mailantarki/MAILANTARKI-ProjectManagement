import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ attempts: 0, sent: [] as { email: string; redirectTo?: string }[], fail: false }));
vi.mock("../../../../lib/auth/rate-limit", () => ({
  requestIp: () => "127.0.0.1",
  reserveAttempt: async () => state.attempts < 5 ? ++state.attempts : null,
  tooMany: () => Response.json({ error: "Too many attempts. Try again later." }, { status: 429 }),
}));
vi.mock("../../../../lib/supabase/server", () => ({ getUserClient: async () => ({ auth: {
  resetPasswordForEmail: async (email: string, options: { redirectTo?: string }) => {
    state.sent.push({ email, redirectTo: options.redirectTo });
    return { data: {}, error: state.fail ? { status: 400, code: "user_not_found" } : null };
  },
} }) }));

import { POST } from "./route";
const request = (body: unknown, origin = "http://localhost") => new Request("http://localhost/api/auth/forgot-password", {
  method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body),
});

describe("forgot password", () => {
  beforeEach(() => { state.attempts = 0; state.sent = []; state.fail = false; });
  it("sends a reset link that returns to this site's confirm route", async () => {
    const response = await POST(request({ email: "person@example.com" }));
    expect(response.status).toBe(200);
    expect(state.sent).toEqual([{ email: "person@example.com", redirectTo: "http://localhost/auth/confirm" }]);
  });
  it("answers the same way when the account does not exist", async () => {
    state.fail = true;
    const response = await POST(request({ email: "nobody@example.com" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
  it("rejects other origins and invalid emails", async () => {
    expect((await POST(request({ email: "person@example.com" }, "https://evil.test"))).status).toBe(403);
    expect((await POST(request({ email: "not-an-email" }))).status).toBe(400);
    expect(state.sent).toHaveLength(0);
  });
  it("rate limits repeated requests", async () => {
    for (let i = 0; i < 5; i++) await POST(request({ email: "person@example.com" }));
    expect((await POST(request({ email: "person@example.com" }))).status).toBe(429);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ failures: 0, valid: false, logs: 0 }));
vi.mock("../../../../lib/auth/rate-limit", () => ({
  requestIp: () => "127.0.0.1",
  reserveAttempt: async () => state.failures < 5 ? ++state.failures : null,
  releaseAttempt: async () => { state.failures--; },
  tooMany: () => Response.json({ error: "Too many attempts. Try again later." }, { status: 429, headers: { "Retry-After": "900" } }),
}));
vi.mock("../../../../lib/supabase/server", () => ({ getUserClient: async () => ({ auth: {
  signInWithPassword: async () => state.valid ? { data: { user: { id: "user-a" } }, error: null } : { data: { user: null }, error: new Error("bad") },
  signOut: async () => {},
}, from: () => ({
  select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { organization_id: "org-a" } }) }) }),
}) }) }));
vi.mock("../../../../lib/auth/log", () => ({ logAccess: async () => { state.logs++; } }));

import { POST } from "./route";
const request = (email = "person@example.com", password = "password123456") => new Request("http://localhost/api/auth/login", {
  method: "POST", headers: { origin: "http://localhost", host: "localhost", "content-type": "application/json" },
  body: JSON.stringify({ email, password }),
});

describe("login", () => {
  beforeEach(() => { state.failures = 0; state.valid = false; state.logs = 0; });
  it("accepts valid credentials and logs in", async () => {
    state.valid = true;
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ redirectTo: "/projects" });
    expect(state.logs).toBe(1);
  });
  it("uses the same generic error for invalid credentials and invalid input", async () => {
    const first = await POST(request());
    const second = await POST(request("bad"));
    expect(first.status).toBe(401);
    expect(await first.json()).toEqual(await second.json());
  });
  it("rejects the sixth failed attempt with Retry-After", async () => {
    for (let i = 0; i < 5; i++) expect((await POST(request())).status).toBe(401);
    const response = await POST(request());
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("900");
  });
});

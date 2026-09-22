import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ active: true, expiresAt: null as string | null, token: "token" }));
vi.mock("next/headers", () => ({ cookies: async () => ({
  get: () => ({ value: state.token }), delete: () => {},
}) }));
vi.mock("../supabase/server", () => ({ getUserClient: async () => ({ auth: { getUser: async () => ({ data: { user: null }, error: null }) } }) }));
vi.mock("../supabase/admin", () => ({ getAdminClient: () => ({ from: () => ({
  select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "code-a", is_active: state.active, expires_at: state.expiresAt } }) }) }),
}) }) }));
vi.mock("../access-codes/session", () => ({ readVisitorSession: async () => "code-a" }));

import { getPrincipal } from "./principal";

describe("visitor principal", () => {
  it("revalidates each request and rejects a newly revoked code", async () => {
    state.active = true; state.expiresAt = null;
    expect(await getPrincipal()).toEqual({ kind: "visitor", accessCodeId: "code-a" });
    state.active = false;
    expect(await getPrincipal()).toBeNull();
  });
  it("rejects an expired code", async () => {
    state.active = true; state.expiresAt = "2020-01-01";
    expect(await getPrincipal()).toBeNull();
  });
});

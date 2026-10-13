import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({
  active: true,
  expiresAt: null as string | null,
  token: "token",
  user: null as { id: string; deleted_at?: string | null; banned_until?: string | null } | null,
  verifiedSub: null as string | null,
  profile: null as { role: string; organization_id: string | null; suspended_at: string | null; must_change_password: boolean } | null,
}));
vi.mock("next/headers", () => ({ cookies: async () => ({
  get: () => ({ value: state.token }), delete: () => {},
}) }));
vi.mock("../supabase/server", () => ({ getUserClient: async () => ({
  auth: {
    getSession: async () => ({ data: { session: state.user ? { access_token: `h.${Buffer.from(JSON.stringify({ sub: state.user.id })).toString("base64url")}.s` } : null } }),
    getClaims: async () => ({ data: state.user ? { claims: { sub: state.verifiedSub ?? state.user.id } } : null, error: null }),
  },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.profile }) }) }) }),
}) }));
vi.mock("../supabase/admin", () => ({ getAdminClient: () => ({ from: () => ({
  select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "code-a", is_active: state.active, expires_at: state.expiresAt } }) }) }),
}) }) }));
vi.mock("../access-codes/session", () => ({ readVisitorSession: async () => "code-a" }));

import { getPrincipal } from "./principal";

describe("visitor principal", () => {
  it("revalidates each request and rejects a newly revoked code", async () => {
    state.user = null; state.active = true; state.expiresAt = null;
    expect(await getPrincipal()).toEqual({ kind: "visitor", accessCodeId: "code-a" });
    state.active = false;
    expect(await getPrincipal()).toBeNull();
  });
  it("rejects an expired code", async () => {
    state.user = null; state.active = true; state.expiresAt = "2020-01-01";
    expect(await getPrincipal()).toBeNull();
  });
});

describe("authenticated user principal readiness", () => {
  const readyProfile = { role: "member", organization_id: "org-a", suspended_at: null, must_change_password: false };

  it("accepts an active account with a ready profile", async () => {
    state.user = { id: "user-a" };
    state.profile = readyProfile;
    expect(await getPrincipal()).toEqual({ kind: "user", userId: "user-a", role: "member", organizationId: "org-a" });
  });

  it.each([
    ["suspended profile", { ...readyProfile, suspended_at: "2026-01-01T00:00:00Z" }],
    ["mandatory password change", { ...readyProfile, must_change_password: true }],
    ["missing profile", null],
  ])("rejects %s", async (_label, profile) => {
    state.user = { id: "user-a" };
    state.profile = profile;
    expect(await getPrincipal()).toBeNull();
  });

  it("ignores a session cookie whose subject does not match the verified token", async () => {
    state.user = { id: "user-a" };
    state.profile = readyProfile;
    state.verifiedSub = "user-b";
    expect(await getPrincipal()).not.toMatchObject({ kind: "user" });
    state.verifiedSub = null;
  });
});

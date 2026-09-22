import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({
  principal: { kind: "user" as const, userId: "admin-a", role: "org_admin" as const, organizationId: "org-a" },
  authCreates: 0, inserts: 0,
  profile: { id: "member-b", organization_id: "org-b", role: "member" },
  project: { id: "project-a", organization_id: "org-a" },
}));
vi.mock("@/lib/auth/principal", () => ({ getPrincipal: async () => state.principal }));
vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: () => ({
  auth: { admin: { createUser: async () => { state.authCreates++; return { data: { user: { id: "new" } }, error: null }; } } },
}) }));
vi.mock("@/lib/supabase/server", () => ({ getUserClient: async () => ({
  from: (table: string) => ({
    select: () => ({ eq: () => ({
      maybeSingle: async () => ({ data: table === "profiles" ? state.profile : state.project }),
      is: () => ({ maybeSingle: async () => ({ data: state.project }) }),
    }) }),
    insert: async () => { state.inserts++; return { error: null }; },
  }),
}) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { createUser, grantUserAccess } from "./actions";

const newUser = (role: string, organizationId: string) => {
  const form = new FormData();
  form.set("email", "new@example.test"); form.set("fullName", "New Person");
  form.set("role", role); form.set("organizationId", organizationId);
  return form;
};
const assignment = () => {
  const form = new FormData();
  form.set("userId", "11111111-1111-4111-8111-111111111111");
  form.set("projectId", "22222222-2222-4222-8222-222222222222");
  form.set("segmentId", "");
  return form;
};

describe("user admin server actions", () => {
  beforeEach(() => { state.authCreates = 0; state.inserts = 0; state.profile.organization_id = "org-b"; });
  it("org admin cannot create a super admin even by calling the action directly", async () => {
    await expect(createUser(newUser("super_admin", ""))).rejects.toThrow("Not authorized");
    expect(state.authCreates).toBe(0);
  });
  it("org admin cannot create users in another organization", async () => {
    await expect(createUser(newUser("member", "11111111-1111-4111-8111-111111111111"))).rejects.toThrow("Not authorized");
    expect(state.authCreates).toBe(0);
  });
  it("org admin cannot grant an outside user access to its project", async () => {
    await expect(grantUserAccess(assignment())).rejects.toThrow("Not authorized");
    expect(state.inserts).toBe(0);
  });
});

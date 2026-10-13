import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ writes: 0 }));
vi.mock("@/lib/auth/principal", () => ({ getPrincipal: async () => ({
  kind: "user", userId: "admin-a", role: "org_admin", organizationId: "11111111-1111-4111-8111-111111111111",
}) }));
vi.mock("@/lib/supabase/server", () => ({ getUserClient: async () => ({
  from: () => ({ insert: async () => { state.writes++; return { error: null }; } }),
}) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { saveOrganization, saveProject } from "./manage-actions";

describe("organization and project server actions", () => {
  it("org admin cannot create an organization by calling the action directly", async () => {
    const form = new FormData(); form.set("name", "Other Organization"); form.set("logoUrl", "");
    await expect(saveOrganization(form)).rejects.toThrow("Not authorized");
    expect(state.writes).toBe(0);
  });
  it("org admin cannot create a project in another organization", async () => {
    const form = new FormData();
    form.set("organizationId", "22222222-2222-4222-8222-222222222222");
    form.set("name", "Other Project"); form.set("slug", "other-project");
    form.set("location", ""); form.set("description", ""); form.set("coverImageUrl", "");
    await expect(saveProject(form)).rejects.toThrow("Not authorized");
    expect(state.writes).toBe(0);
  });
});

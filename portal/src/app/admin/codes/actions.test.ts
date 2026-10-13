import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ writes: 0 }));
vi.mock("@/lib/auth/principal", () => ({ getPrincipal: async () => ({ kind: "user",
  userId: "admin-a", role: "org_admin", organizationId: "11111111-1111-4111-8111-111111111111" }) }));
vi.mock("@/lib/supabase/server", () => ({ getUserClient: async () => ({
  from: () => ({ select: () => ({ eq: () => ({ is: () => ({ maybeSingle: async () => ({ data: { id: "11111111-1111-4111-8111-111111111111" } }) }) }) }) }),
  rpc: async () => { state.writes++; return { error: null }; },
}) }));
vi.mock("@/lib/access-codes/hash", () => ({ hashCode: () => "a".repeat(64) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { createAccessCode } from "./actions";

describe("access code server action", () => {
  it("org admin cannot create a code for another organization by calling the action", async () => {
    const form = new FormData();
    form.set("organizationId", "22222222-2222-4222-8222-222222222222");
    form.set("label", "Cross-org attempt"); form.set("expiresAt", ""); form.set("maxUses", "");
    form.set("grants", '[{"projectId":"33333333-3333-4333-8333-333333333333","segmentId":null}]');
    await expect(createAccessCode(form)).rejects.toThrow("Not authorized");
    expect(state.writes).toBe(0);
  });
});

import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ organizationId: "other", writes: 0 }));
vi.mock("@/lib/auth/principal", () => ({ getPrincipal: async () => ({ kind: "user", role: "org_admin", organizationId: "own" }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getUserClient: async () => ({ from: () => {
  const query = { select: () => query, eq: () => query, is: () => query,
    maybeSingle: async () => ({ data: { id: "code", organization_id: state.organizationId }, error: null }),
    update: (values: { is_active: boolean; deleted_at: string }) => {
      expect(values.is_active).toBe(false); expect(Date.parse(values.deleted_at)).not.toBeNaN();
      state.writes++; return query;
    } };
  return query;
} }) }));
import { deleteAccessCode } from "./actions";
beforeEach(() => { state.writes = 0; state.organizationId = "other"; });
function input() { const form = new FormData(); form.set("id", "11111111-1111-4111-8111-111111111111"); return form; }
it("rejects cross-organization deletion directly in the action", async () => {
  await expect(deleteAccessCode(input())).rejects.toThrow("Code not found");
  expect(state.writes).toBe(0);
});
it("deactivates and soft-deletes own code in one user-client write", async () => {
  state.organizationId = "own";
  await deleteAccessCode(input()); expect(state.writes).toBe(1);
});

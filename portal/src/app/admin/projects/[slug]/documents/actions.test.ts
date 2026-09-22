import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ updates: 0 }));
vi.mock("@/lib/auth/principal", () => ({ getPrincipal: async () => ({
  kind: "user", userId: "admin-a", role: "org_admin", organizationId: "org-a",
}) }));
vi.mock("@/lib/auth/authorize", () => ({ authorize: async () => false }));
vi.mock("@/lib/supabase/server", () => ({ getUserClient: async () => ({
  from: () => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: {
      id: "11111111-1111-4111-8111-111111111111", project_id: "project-b",
      segment_id: "segment-b", upload_status: "ready", archived_at: null,
    } }) }) }),
    update: () => { state.updates++; return {}; },
  }),
}) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { setDocumentArchived, setDocumentFeatured, updateDocumentMetadata } from "./actions";

describe("document archive server action", () => {
  it("rejects an org admin archiving a foreign document by guessed ID", async () => {
    state.updates = 0;
    const form = new FormData();
    form.set("id", "11111111-1111-4111-8111-111111111111");
    form.set("archived", "true");
    await expect(setDocumentArchived(form)).rejects.toThrow("Document not found");
    expect(state.updates).toBe(0);
  });

  it("rejects an org admin featuring a foreign document by guessed ID", async () => {
    state.updates = 0;
    const form = new FormData();
    form.set("id", "11111111-1111-4111-8111-111111111111");
    form.set("featured", "true");
    await expect(setDocumentFeatured(form)).rejects.toThrow("Document not found");
    expect(state.updates).toBe(0);
  });

  it("rejects an org admin editing a foreign document by guessed ID", async () => {
    state.updates = 0;
    const form = new FormData();
    form.set("id", "11111111-1111-4111-8111-111111111111");
    form.set("title", "Foreign drawing");
    form.set("docNumber", "ARC-999");
    form.set("docType", "plan");
    form.set("revision", "0");
    form.set("status", "draft");
    form.set("issueDate", "");
    form.set("description", "");
    await expect(updateDocumentMetadata(form)).rejects.toThrow("Document not found");
    expect(state.updates).toBe(0);
  });
});

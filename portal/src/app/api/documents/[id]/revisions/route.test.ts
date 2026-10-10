import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ principal: null as null | { kind: string }, allowed: true, found: true,
  rows: [] as Record<string, unknown>[], filters: [] as string[] }));
vi.mock("../../../../../lib/auth/principal", () => ({ getPrincipal: async () => state.principal }));
vi.mock("../../../../../lib/auth/authorize", () => ({ authorize: async () => state.allowed }));
vi.mock("../../../../../lib/supabase/admin", () => ({ getAdminClient: () => ({
  from: () => ({ select: (fields: string) => {
    const chain = {
      eq: (column: string, value: string) => { state.filters.push(`${column}=${value}`); return chain; },
      is: () => chain,
      maybeSingle: async () => ({ data: state.found ? { project_id: "p", segment_id: "s", doc_number: "A-101",
        upload_status: "ready", archived_at: null } : null, error: null }),
      limit: async () => ({ data: fields.includes("file_path") ? null : state.rows, error: null }),
    };
    return chain;
  } }),
}) }));
import { GET } from "./route";

const id = "80c6c7ab-3f13-4c8d-9eda-6a000d70ae41";
const run = () => GET(new Request(`http://localhost/api/documents/${id}/revisions`), { params: Promise.resolve({ id }) });

describe("document revisions", () => {
  beforeEach(() => { state.principal = { kind: "user" }; state.allowed = true; state.found = true; state.filters = []; state.rows = [
    { id: "a", title: "Plan", revision: "A", status: "draft", issue_date: null, is_current: false, superseded_at: "2026-10-01" },
    { id: "c", title: "Plan", revision: "C", status: "issued_for_construction", issue_date: null, is_current: true, superseded_at: null },
    { id: "b", title: "Plan", revision: "B", status: "draft", issue_date: null, is_current: false, superseded_at: "2026-10-02" },
  ]; });
  it("rejects anonymous requests and hides documents the principal cannot view", async () => {
    state.principal = null;
    expect((await run()).status).toBe(401);
    state.principal = { kind: "user" }; state.allowed = false;
    expect((await run()).status).toBe(404);
    state.allowed = true; state.found = false;
    expect((await run()).status).toBe(404);
  });
  it("lists the current revision first, then the history from newest to oldest, without file paths", async () => {
    const response = await run();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await response.json();
    expect(body.revisions.map((r: { id: string }) => r.id)).toEqual(["c", "b", "a"]);
    expect(JSON.stringify(body)).not.toContain("file_path");
    expect(state.filters).toEqual(expect.arrayContaining(["project_id=p", "segment_id=s", "doc_number=A-101", "upload_status=ready"]));
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ principal: null as null | { kind: string; userId?: string; accessCodeId?: string },
  allowed: true, downloadable: true, document: true, logs: 0, calls: [] as string[], signed: 0 }));
vi.mock("../../../../../lib/auth/principal", () => ({ getPrincipal: async () => state.principal }));
vi.mock("../../../../../lib/auth/authorize", () => ({ authorize: async (_p: unknown, _t: unknown, action: string) => {
  state.calls.push(`authorize:${action}`); return action === "download" ? state.downloadable : state.allowed;
} }));
vi.mock("../../../../../lib/auth/log", () => ({ logAccess: async () => { state.calls.push("log"); state.logs++; } }));
vi.mock("../../../../../lib/supabase/admin", () => ({ getAdminClient: () => ({
  from: (table: string) => table === "documents" ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.document ? {
    id: "doc", project_id: "project", segment_id: "segment", file_path: "private.pdf", upload_status: "ready", archived_at: null, doc_number: "A1", projects: { organization_id: "org" },
  } : null, error: null }) }) }) } : { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { label: "Guest" } }) }) }) },
  storage: { from: () => ({ createSignedUrl: async (_path: string, seconds: number) => {
    state.calls.push(`sign:${seconds}`); state.signed++; return { data: { signedUrl: "https://storage.test/signed" }, error: null };
  } }) },
}) }));
import { GET } from "./route";
const id = "80c6c7ab-3f13-4c8d-9eda-6a000d70ae41";
const run = (download = "0", cookie = "") => GET(new Request(`http://localhost/api/documents/${id}/url?download=${download}`, { headers: cookie ? { cookie } : {} }), { params: Promise.resolve({ id }) });

describe("document URL", () => {
  beforeEach(() => { state.principal = null; state.allowed = true; state.downloadable = true; state.document = true; state.logs = 0; state.signed = 0; state.calls = []; });
  it("rejects an anonymous request", async () => { expect((await run()).status).toBe(401); });
  it("conceals a revoked or expired visitor session", async () => { expect((await run("0", "visitor_session=expired")).status).toBe(404); });
  it("conceals a different segment or project and missing documents", async () => {
    state.principal = { kind: "user", userId: "member" }; state.allowed = false;
    expect((await run()).status).toBe(404);
    state.allowed = true; state.document = false;
    expect((await run()).status).toBe(404);
    expect(state.signed).toBe(0);
  });
  it("rejects a download without its grant", async () => {
    state.principal = { kind: "visitor", accessCodeId: "code" }; state.downloadable = false;
    expect((await run("1")).status).toBe(404);
    expect(state.logs).toBe(0);
  });
  it("logs before signing, limits lifetime to 300 seconds, and never exposes the path", async () => {
    state.principal = { kind: "user", userId: "member" };
    const response = await run();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(state.calls).toEqual(["authorize:view", "authorize:download", "log", "sign:300"]);
    expect(await response.json()).toEqual({ url: "https://storage.test/signed", expiresIn: 300, allowDownload: true });
  });
});

import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { authorizeWithReader } from "./authorize";

const project = { organization_id: "org-a", archived_at: null, organizations: { archived_at: null } };
const target = { projectId: "project-a", segmentId: "mep" };
const user = (role: "super_admin" | "org_admin" | "member", organizationId = "org-a") =>
  ({ kind: "user" as const, userId: "user-a", role, organizationId });
const visitor = { kind: "visitor" as const, accessCodeId: "code-a" };
const db = (overrides: Record<string, unknown> = {}) => ({
  project: async () => project,
  member: async () => [{ can_download: false }],
  code: async () => ({ organization_id: "org-a", is_active: true, expires_at: null, allow_download: false }),
  grants: async () => true,
  ...overrides,
});

describe("authorize", () => {
  it("rejects missing principal and archived project or organization", async () => {
    expect(await authorizeWithReader(null, target, "view", db())).toBe(false);
    expect(await authorizeWithReader(user("super_admin"), target, "view", db({ project: async () => ({ ...project, archived_at: "today" }) }))).toBe(false);
    expect(await authorizeWithReader(user("super_admin"), target, "view", db({ project: async () => ({ ...project, organizations: { archived_at: "today" } }) }))).toBe(false);
  });
  it("allows super admins, including download and upload", async () => {
    for (const action of ["view", "download", "admin_upload"] as const)
      expect(await authorizeWithReader(user("super_admin"), target, action, db())).toBe(true);
  });
  it("limits org admins to their organization", async () => {
    expect(await authorizeWithReader(user("org_admin"), target, "admin_upload", db())).toBe(true);
    expect(await authorizeWithReader(user("org_admin", "org-b"), target, "view", db())).toBe(false);
  });
  it("limits members to assigned segments and download flag", async () => {
    expect(await authorizeWithReader(user("member"), target, "view", db())).toBe(true);
    expect(await authorizeWithReader(user("member"), target, "download", db())).toBe(false);
    expect(await authorizeWithReader(user("member"), target, "admin_upload", db())).toBe(false);
    expect(await authorizeWithReader(user("member"), target, "view", db({ member: async () => [] }))).toBe(false);
    expect(await authorizeWithReader(user("member", "org-b"), target, "view", db())).toBe(false);
    expect(await authorizeWithReader(user("member"), target, "download", db({ member: async () => [{ can_download: true }] }))).toBe(true);
  });
  it("applies project-wide and exact-segment member grants", async () => {
    const grants = [
      { segmentId: null, can_download: false },
      { segmentId: "architecture", can_download: true },
    ];
    const reader = db({
      member: async (_userId: string, _projectId: string, segmentId: string) =>
        grants.filter((grant) => grant.segmentId === null || grant.segmentId === segmentId),
    });
    expect(await authorizeWithReader(user("member"), { projectId: "project-a", segmentId: "mep" }, "view", reader)).toBe(true);
    expect(await authorizeWithReader(user("member"), { projectId: "project-a", segmentId: "architecture" }, "download", reader)).toBe(true);
    expect(await authorizeWithReader(user("member"), { projectId: "project-a", segmentId: "sales-plan" }, "download", reader)).toBe(false);
  });
  it("limits visitors by grant, expiry, revocation and download flag", async () => {
    expect(await authorizeWithReader(visitor, target, "view", db())).toBe(true);
    expect(await authorizeWithReader(visitor, target, "download", db())).toBe(false);
    expect(await authorizeWithReader(visitor, target, "admin_upload", db())).toBe(false);
    expect(await authorizeWithReader(visitor, target, "view", db({ grants: async () => false }))).toBe(false);
    expect(await authorizeWithReader(visitor, target, "view", db({ code: async () => ({ organization_id: "org-a", is_active: false, expires_at: null, allow_download: true }) }))).toBe(false);
    expect(await authorizeWithReader(visitor, target, "view", db({ code: async () => ({ organization_id: "org-a", is_active: true, expires_at: "2020-01-01", allow_download: true }) }))).toBe(false);
  });
  it("applies project-wide and exact-segment visitor grants", async () => {
    const targetSegments = new Set(["mep"]);
    const projectWide = false;
    const reader = db({
      grants: async (_codeId: string, projectId: string, segmentId: string) =>
        projectId === "project-a" && (projectWide || targetSegments.has(segmentId)),
    });
    expect(await authorizeWithReader(visitor, { projectId: "project-a", segmentId: "mep" }, "view", reader)).toBe(true);
    expect(await authorizeWithReader(visitor, { projectId: "project-a", segmentId: "architecture" }, "view", reader)).toBe(false);
    expect(await authorizeWithReader(visitor, { projectId: "project-b", segmentId: "mep" }, "view", reader)).toBe(false);

    const projectGrantReader = db({ grants: async (_codeId: string, projectId: string) => projectId === "project-a" });
    expect(await authorizeWithReader(visitor, { projectId: "project-a", segmentId: "sales-plan" }, "view", projectGrantReader)).toBe(true);
  });
});

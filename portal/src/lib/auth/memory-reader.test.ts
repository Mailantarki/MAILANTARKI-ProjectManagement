import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { authorizeWithReader, memoryReader, type ProjectAccess } from "./authorize";

const active: ProjectAccess = { organization_id: "org-a", archived_at: null, organizations: { archived_at: null } };
const projects = new Map<string, ProjectAccess>([["project-a", active], ["project-b", active]]);
const member = { kind: "user" as const, userId: "user-a", role: "member" as const, organizationId: "org-a" };
const visitor = { kind: "visitor" as const, accessCodeId: "code-a" };
const code: { organization_id: string; is_active: boolean; expires_at: string | null; allow_download: boolean } =
  { organization_id: "org-a", is_active: true, expires_at: null, allow_download: false };

describe("memoryReader", () => {
  it("returns unknown projects as missing", async () => {
    const reader = memoryReader({ projects });
    expect(await reader.project("project-x")).toBeNull();
    expect(await authorizeWithReader({ ...member, role: "super_admin" }, { projectId: "project-x", segmentId: "mep" }, "view", reader)).toBe(false);
  });

  it("applies project-wide and exact-segment member grants", async () => {
    const reader = memoryReader({ projects, member: { userId: "user-a", grants: [
      { project_id: "project-a", segment_id: null, can_download: false },
      { project_id: "project-b", segment_id: "architecture", can_download: true },
    ] } });
    const can = (projectId: string, segmentId: string, action: "view" | "download") =>
      authorizeWithReader(member, { projectId, segmentId }, action, reader);
    expect(await can("project-a", "mep", "view")).toBe(true);
    expect(await can("project-a", "mep", "download")).toBe(false);
    expect(await can("project-b", "architecture", "download")).toBe(true);
    expect(await can("project-b", "mep", "view")).toBe(false);
  });

  it("never answers for a different member or access code", async () => {
    const reader = memoryReader({ projects,
      member: { userId: "user-a", grants: [{ project_id: "project-a", segment_id: null, can_download: true }] },
      visitor: { accessCodeId: "code-a", code, grants: [{ project_id: "project-a", segment_id: null }] } });
    expect(await reader.member("user-b", "project-a", "mep")).toEqual([]);
    expect(await reader.code("code-b")).toBeNull();
    expect(await reader.grants("code-b", "project-a", "mep")).toBe(false);
  });

  it("applies visitor grants, revocation and expiry", async () => {
    const grants = [{ project_id: "project-a", segment_id: "mep" }];
    const can = (c: typeof code | null, segmentId: string) => authorizeWithReader(visitor,
      { projectId: "project-a", segmentId }, "view", memoryReader({ projects, visitor: { accessCodeId: "code-a", code: c, grants } }));
    expect(await can(code, "mep")).toBe(true);
    expect(await can(code, "architecture")).toBe(false);
    expect(await can({ ...code, is_active: false }, "mep")).toBe(false);
    expect(await can({ ...code, expires_at: "2020-01-01" }, "mep")).toBe(false);
    expect(await can(null, "mep")).toBe(false);
  });
});

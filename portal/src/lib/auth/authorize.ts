import "server-only";
import type { Principal } from "./principal";
import { getAdminClient } from "../supabase/admin";

export type Action = "view" | "download" | "admin_upload" | "admin_manage";
export type Target = { projectId: string; segmentId: string };
export type Reader = {
  project(id: string): Promise<{ organization_id: string; archived_at: string | null; organizations: { archived_at: string | null } | null } | null>;
  member(userId: string, projectId: string, segmentId: string): Promise<{ can_download: boolean }[]>;
  code(id: string): Promise<{ organization_id: string; is_active: boolean; expires_at: string | null; allow_download: boolean } | null>;
  grants(id: string, projectId: string, segmentId: string): Promise<boolean>;
};

export async function authorizeWithReader(p: Principal | null, target: Target, action: Action, db: Reader): Promise<boolean> {
  if (!p) return false;
  const project = await db.project(target.projectId);
  if (action === "admin_manage") {
    if (!project || p.kind !== "user") return false;
    return p.role === "super_admin" || (p.role === "org_admin" && p.organizationId === project.organization_id && !project.organizations?.archived_at);
  }
  if (!project || project.archived_at || project.organizations?.archived_at || !project.organizations) return false;
  if (p.kind === "user") {
    if (p.role === "super_admin") return true;
    if (p.organizationId !== project.organization_id) return false;
    if (p.role === "org_admin") return true;
    if (action === "admin_upload") return false;
    const grants = await db.member(p.userId, target.projectId, target.segmentId);
    return grants.some((g) => action !== "download" || g.can_download);
  }
  if (action === "admin_upload") return false;
  const code = await db.code(p.accessCodeId);
  if (!code || code.organization_id !== project.organization_id || !code.is_active ||
      (code.expires_at && new Date(code.expires_at).getTime() <= Date.now())) return false;
  if (action === "download" && !code.allow_download) return false;
  return db.grants(p.accessCodeId, target.projectId, target.segmentId);
}

const reader: Reader = {
  async project(id) {
    const { data, error } = await getAdminClient().from("projects")
      .select("organization_id,archived_at,organizations(archived_at)").eq("id", id).maybeSingle();
    if (error) throw error;
    return data as Awaited<ReturnType<Reader["project"]>>;
  },
  async member(userId, projectId, segmentId) {
    const { data, error } = await getAdminClient().from("user_project_access")
      .select("can_download").eq("user_id", userId).eq("project_id", projectId)
      .or(`segment_id.is.null,segment_id.eq.${segmentId}`);
    if (error) throw error;
    return data ?? [];
  },
  async code(id) {
    const { data, error } = await getAdminClient().from("access_codes")
      .select("organization_id,is_active,expires_at,allow_download").eq("id", id).maybeSingle();
    if (error) throw error;
    return data;
  },
  async grants(id, projectId, segmentId) {
    const { data, error } = await getAdminClient().from("access_code_grants")
      .select("id").eq("access_code_id", id).eq("project_id", projectId)
      .or(`segment_id.is.null,segment_id.eq.${segmentId}`).limit(1);
    if (error) throw error;
    return (data?.length ?? 0) > 0;
  },
};

export async function authorize(p: Principal | null, target: Target, action: Action): Promise<boolean> {
  return authorizeWithReader(p, target, action, reader);
}

export function isAdminPrincipal(p: Principal | null): p is Extract<Principal, { kind: "user" }> {
  return p?.kind === "user" && (p.role === "super_admin" || p.role === "org_admin");
}

export function authorizeAdminOrganization(p: Principal | null, organizationId: string): boolean {
  return isAdminPrincipal(p) && (p.role === "super_admin" || p.organizationId === organizationId);
}

export function authorizeUserCreation(p: Principal | null, organizationId: string | null,
  role: "super_admin" | "org_admin" | "member"): boolean {
  if (!isAdminPrincipal(p)) return false;
  if (p.role === "super_admin") return role === "super_admin" ? organizationId === null : organizationId !== null;
  return role !== "super_admin" && organizationId !== null && p.organizationId === organizationId;
}

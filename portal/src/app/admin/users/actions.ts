"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getPrincipal } from "@/lib/auth/principal";
import { authorize, authorizeAdminOrganization, authorizeUserAssignment, authorizeUserCreation, authorizeUserSuspension } from "@/lib/auth/authorize";
import { getUserClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";

const uuid = z.uuid();
const newUserInput = z.object({
  email: z.email().max(320),
  fullName: z.string().trim().min(1).max(120),
  role: z.enum(["super_admin", "org_admin", "member"]),
  organizationId: z.union([uuid, z.literal("")]).transform((value) => value || null),
});

export async function createUser(form: FormData): Promise<{ password: string }> {
  const input = newUserInput.parse({
    email: form.get("email"), fullName: form.get("fullName"),
    role: form.get("role"), organizationId: form.get("organizationId"),
  });
  const principal = await getPrincipal();
  if (!authorizeUserCreation(principal, input.organizationId, input.role)) throw new Error("Not authorized");
  if (input.organizationId) {
    const user = await getUserClient();
    const { data: org } = await user.from("organizations").select("id")
      .eq("id", input.organizationId).is("archived_at", null).maybeSingle();
    if (!org || !authorizeAdminOrganization(principal, org.id)) throw new Error("Organization not found");
  }
  const password = randomBytes(24).toString("base64url");
  const admin = getAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: input.email, password, email_confirm: true,
  });
  if (error || !data.user) throw new Error("Could not create user");
  const { error: profileError } = await admin.from("profiles").insert({
    id: data.user.id, organization_id: input.organizationId,
    role: input.role, full_name: input.fullName,
    must_change_password: true,
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id);
    throw new Error("Could not create user profile");
  }
  const { error: auditError } = await admin.from("admin_events").insert({
    actor_id: principal?.kind === "user" ? principal.userId : null, target_user_id: data.user.id,
    organization_id: input.organizationId, action: "user_created",
  });
  if (auditError) {
    await admin.auth.admin.deleteUser(data.user.id);
    throw new Error("Could not create user");
  }
  revalidatePath("/admin/users");
  return { password };
}

export async function grantUserAccess(form: FormData) {
  const input = z.object({ userId: uuid, projectId: uuid,
    segmentId: z.union([uuid, z.literal("")]).transform((value) => value || null),
    canDownload: z.boolean(),
  }).parse({ userId: form.get("userId"), projectId: form.get("projectId"),
    segmentId: form.get("segmentId"), canDownload: form.get("canDownload") === "on" });
  const principal = await getPrincipal();
  const user = await getUserClient();
  const [{ data: profile }, { data: project }] = await Promise.all([
    user.from("profiles").select("id,organization_id,role").eq("id", input.userId).maybeSingle(),
    user.from("projects").select("id,organization_id").eq("id", input.projectId).is("archived_at", null).maybeSingle(),
  ]);
  if (!profile || !project || !authorizeUserAssignment(principal, profile.id, profile.organization_id,
    profile.role, project.organization_id) || !(await authorize(principal,
    { projectId: project.id, segmentId: input.segmentId ?? "00000000-0000-0000-0000-000000000000" }, "admin_manage"))) {
    throw new Error("Not authorized");
  }
  if (input.segmentId) {
    const { data: segment } = await user.from("segments").select("id").eq("id", input.segmentId).maybeSingle();
    if (!segment) throw new Error("Invalid segment");
  }
  const { error } = await user.from("user_project_access").insert({
    user_id: input.userId, project_id: input.projectId,
    segment_id: input.segmentId, can_download: input.canDownload,
  });
  if (error) throw new Error(error.code === "23505" ? "Assignment already exists" : "Could not assign access");
  revalidatePath("/admin/users");
}

export async function setUserSuspended(form: FormData) {
  const id = uuid.parse(form.get("userId"));
  const suspended = z.enum(["true", "false"]).parse(form.get("suspended")) === "true";
  const principal = await getPrincipal();
  const user = await getUserClient();
  const { data: target } = await user.from("profiles").select("id,organization_id,role").eq("id", id).maybeSingle();
  if (!target || !authorizeUserSuspension(principal, target)) throw new Error("Not authorized");
  // Database state blocks existing JWTs first. Auth ban additionally blocks direct sign-ins.
  if (suspended) {
    const { error } = await user.rpc("set_user_suspended", { p_user: id, p_suspended: true });
    if (error) throw new Error("Could not suspend user");
  }
  const { error: authError } = await getAdminClient().auth.admin.updateUserById(id, {
    ban_duration: suspended ? "876000h" : "none",
  });
  if (authError) {
    revalidatePath("/admin/users");
    throw new Error(suspended ? "Portal access blocked. Auth synchronization failed; retry suspension." : "Could not reactivate user");
  }
  if (!suspended) {
    const { error } = await user.rpc("set_user_suspended", { p_user: id, p_suspended: false });
    if (error) throw new Error("Could not reactivate user");
  }
  revalidatePath("/admin/users");
}

export async function removeUserAccess(form: FormData) {
  const assignmentId = uuid.parse(form.get("assignmentId"));
  const principal = await getPrincipal();
  const user = await getUserClient();
  const { data: grant } = await user.from("user_project_access")
    .select("id,user_id,project_id").eq("id", assignmentId).maybeSingle();
  if (!grant) throw new Error("Assignment not found");
  const [{ data: profile }, { data: project }] = await Promise.all([
    user.from("profiles").select("id,organization_id,role").eq("id", grant.user_id).maybeSingle(),
    user.from("projects").select("id,organization_id").eq("id", grant.project_id).maybeSingle(),
  ]);
  if (!profile || !project || !authorizeUserAssignment(principal, profile.id, profile.organization_id,
    profile.role, project.organization_id) || !(await authorize(principal,
    { projectId: project.id, segmentId: "00000000-0000-0000-0000-000000000000" }, "admin_manage"))) {
    throw new Error("Not authorized");
  }
  const { error } = await user.from("user_project_access").delete().eq("id", assignmentId);
  if (error) throw new Error("Could not remove assignment");
  revalidatePath("/admin/users");
}

/**
 * "Resend invite" for someone who never signed in: sends the standard set-password email
 * (Supabase Auth). The temporary password stops mattering once they set their own.
 */
export async function resendInvite(input: unknown) {
  const id = uuid.parse(input);
  const principal = await getPrincipal();
  const user = await getUserClient();
  const { data: target } = await user.from("profiles").select("id,organization_id,role").eq("id", id).maybeSingle();
  if (!target || !authorizeUserSuspension(principal, target)) throw new Error("Not authorized");
  const admin = getAdminClient();
  const { data } = await admin.auth.admin.getUserById(id);
  const email = data.user?.email;
  if (!email) throw new Error("This person has no email address");
  const { headers } = await import("next/headers");
  const request = await headers();
  const origin = process.env.PORTAL_URL || `${request.get("x-forwarded-proto") ?? "https"}://${request.get("host")}`;
  const { error } = await admin.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/confirm` });
  if (error) throw new Error("Could not send the email. Check the email settings in Supabase Auth.");
}

const accessPlan = z.object({
  userId: uuid,
  projects: z.array(z.object({
    projectId: uuid,
    mode: z.enum(["none", "all", "some"]),
    segmentIds: z.array(uuid).max(50),
    canDownload: z.boolean(),
  })).min(1).max(200),
});

/**
 * "Save access" of the person panel: the whole project × discipline matrix in one step. Only the
 * projects sent are touched, and each one must be a project this admin may assign.
 */
export async function saveUserAccess(input: unknown) {
  const plan = accessPlan.parse(input);
  const principal = await getPrincipal();
  const user = await getUserClient();
  const projectIds = plan.projects.map((p) => p.projectId);
  const [{ data: profile }, { data: projects }, { data: segments }, { data: existing, error: loadError }] = await Promise.all([
    user.from("profiles").select("id,organization_id,role").eq("id", plan.userId).maybeSingle(),
    user.from("projects").select("id,organization_id").in("id", projectIds).is("archived_at", null),
    user.from("segments").select("id"),
    user.from("user_project_access").select("id,project_id,segment_id,can_download").eq("user_id", plan.userId).in("project_id", projectIds),
  ]);
  if (!profile || loadError || (projects ?? []).length !== new Set(projectIds).size) throw new Error("Not authorized");
  const known = new Set((segments ?? []).map((s) => s.id));
  for (const project of projects ?? []) {
    if (!authorizeUserAssignment(principal, profile.id, profile.organization_id, profile.role, project.organization_id)
      || !(await authorize(principal, { projectId: project.id, segmentId: "00000000-0000-0000-0000-000000000000" }, "admin_manage"))) {
      throw new Error("Not authorized");
    }
  }
  const key = (segmentId: string | null, canDownload: boolean) => `${segmentId ?? "all"}:${canDownload}`;
  const removals: string[] = [];
  const inserts: { user_id: string; project_id: string; segment_id: string | null; can_download: boolean }[] = [];
  for (const item of plan.projects) {
    if (item.mode === "some" && (!item.segmentIds.length || item.segmentIds.some((id) => !known.has(id)))) throw new Error("Choose at least one discipline");
    const wanted = new Set(item.mode === "none" ? [] : item.mode === "all" ? [key(null, item.canDownload)]
      : item.segmentIds.map((id) => key(id, item.canDownload)));
    const current = (existing ?? []).filter((row) => row.project_id === item.projectId);
    const have = new Set(current.map((row) => key(row.segment_id, row.can_download)));
    for (const row of current) if (!wanted.has(key(row.segment_id, row.can_download))) removals.push(row.id);
    for (const wantedKey of wanted) if (!have.has(wantedKey)) {
      const [segment, download] = wantedKey.split(":");
      inserts.push({ user_id: plan.userId, project_id: item.projectId, segment_id: segment === "all" ? null : segment, can_download: download === "true" });
    }
  }
  if (removals.length) {
    const { error } = await user.from("user_project_access").delete().in("id", removals);
    if (error) throw new Error("Could not save access");
  }
  if (inserts.length) {
    const { error } = await user.from("user_project_access").insert(inserts);
    if (error) throw new Error("Could not save access");
  }
  revalidatePath("/admin/users");
  return { added: inserts.length, removed: removals.length };
}

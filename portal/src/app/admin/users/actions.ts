"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getPrincipal } from "@/lib/auth/principal";
import { authorize, authorizeAdminOrganization, authorizeUserAssignment, authorizeUserCreation } from "@/lib/auth/authorize";
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
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id);
    throw new Error("Could not create user profile");
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

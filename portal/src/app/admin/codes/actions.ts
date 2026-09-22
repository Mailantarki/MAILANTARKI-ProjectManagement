"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getPrincipal } from "@/lib/auth/principal";
import { authorize, authorizeAdminOrganization } from "@/lib/auth/authorize";
import { getUserClient } from "@/lib/supabase/server";
import { generateCode } from "@/lib/access-codes/generate";
import { hashCode } from "@/lib/access-codes/hash";

const uuid = z.uuid();
const grants = z.array(z.object({ projectId: uuid,
  segmentId: uuid.nullable() })).min(1).max(50);
const codeInput = z.object({
  organizationId: uuid,
  label: z.string().trim().min(1).max(120),
  expiresAt: z.union([z.iso.datetime(), z.literal("")]).transform((value) => value || null),
  maxUses: z.union([z.coerce.number().int().min(1).max(100000), z.literal("")]).transform((value) => value || null),
  allowDownload: z.boolean(),
  grants,
});

export async function createAccessCode(form: FormData): Promise<{ code: string }> {
  const input = codeInput.parse({
    organizationId: form.get("organizationId"), label: form.get("label"),
    expiresAt: form.get("expiresAt") ?? "", maxUses: form.get("maxUses") || "",
    allowDownload: form.get("allowDownload") === "on",
    grants: JSON.parse(z.string().max(10000).parse(form.get("grants"))),
  });
  const principal = await getPrincipal();
  if (!authorizeAdminOrganization(principal, input.organizationId)) throw new Error("Not authorized");
  const user = await getUserClient();
  const { data: organization } = await user.from("organizations").select("id")
    .eq("id", input.organizationId).is("archived_at", null).maybeSingle();
  if (!organization) throw new Error("Organization not found");
  for (const grant of input.grants) {
    const { data: project } = await user.from("projects").select("id,organization_id")
      .eq("id", grant.projectId).is("archived_at", null).maybeSingle();
    if (!project || project.organization_id !== input.organizationId || !(await authorize(principal,
      { projectId: project.id, segmentId: grant.segmentId ?? "00000000-0000-0000-0000-000000000000" }, "admin_manage"))) {
      throw new Error("Project not found");
    }
    if (grant.segmentId) {
      const { data: segment } = await user.from("segments").select("id").eq("id", grant.segmentId).maybeSingle();
      if (!segment) throw new Error("Invalid segment");
    }
  }
  const code = generateCode();
  const { error } = await user.rpc("create_access_code_with_grants", {
    p_organization: input.organizationId, p_hash: hashCode(code), p_label: input.label,
    p_expires_at: input.expiresAt, p_max_uses: input.maxUses,
    p_allow_download: input.allowDownload,
    p_grants: input.grants.map((grant) => ({ project_id: grant.projectId, segment_id: grant.segmentId })),
  });
  if (error) throw new Error("Could not create access code");
  revalidatePath("/admin/codes");
  return { code };
}

export async function setCodeActive(form: FormData) {
  const id = uuid.parse(form.get("id"));
  const active = z.enum(["true", "false"]).parse(form.get("active")) === "true";
  const principal = await getPrincipal();
  const user = await getUserClient();
  const { data: code } = await user.from("access_codes").select("id,organization_id")
    .eq("id", id).maybeSingle();
  if (!code || !authorizeAdminOrganization(principal, code.organization_id)) throw new Error("Code not found");
  const { error } = await user.from("access_codes").update({ is_active: active }).eq("id", id);
  if (error) throw new Error("Could not update access code");
  revalidatePath("/admin/codes");
}

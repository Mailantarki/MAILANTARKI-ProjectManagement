"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getPrincipal } from "@/lib/auth/principal";
import { authorize, authorizeAdminOrganization, authorizeSuperAdmin } from "@/lib/auth/authorize";
import { getUserClient } from "@/lib/supabase/server";

const uuid = z.uuid();
const optionalUrl = z.union([z.url(), z.literal("")]).transform((value) => value || null);
const organizationInput = z.object({
  name: z.string().trim().min(2).max(120),
  logoUrl: optionalUrl,
});
const projectInput = z.object({
  organizationId: uuid,
  name: z.string().trim().min(2).max(160),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100),
  location: z.string().trim().max(160),
  description: z.string().trim().max(2000),
  coverImageUrl: optionalUrl,
  isPublic: z.boolean(),
});

function field(form: FormData, name: string) {
  return form.get(name);
}

export async function saveOrganization(form: FormData) {
  const id = field(form, "id") ? uuid.parse(field(form, "id")) : null;
  const input = organizationInput.parse({ name: field(form, "name"), logoUrl: field(form, "logoUrl") });
  const principal = await getPrincipal();
  if (id ? !authorizeAdminOrganization(principal, id) : !authorizeSuperAdmin(principal)) throw new Error("Not authorized");
  const user = await getUserClient();
  if (id) {
    const { data: org } = await user.from("organizations").select("id").eq("id", id).maybeSingle();
    if (!org) throw new Error("Organization not found");
    const { error } = await user.from("organizations").update({ name: input.name, logo_url: input.logoUrl }).eq("id", id);
    if (error) throw new Error(error.code === "23505" ? "Organization name already exists" : "Could not save organization");
  } else {
    const { error } = await user.from("organizations").insert({ name: input.name, logo_url: input.logoUrl });
    if (error) throw new Error(error.code === "23505" ? "Organization name already exists" : "Could not create organization");
  }
  revalidatePath("/admin/organizations");
}

export async function setOrganizationArchived(form: FormData) {
  const id = uuid.parse(field(form, "id"));
  const archived = z.enum(["true", "false"]).parse(field(form, "archived")) === "true";
  const principal = await getPrincipal();
  if (!authorizeAdminOrganization(principal, id)) throw new Error("Not authorized");
  const user = await getUserClient();
  const { data, error } = await user.from("organizations").update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id).select("id").maybeSingle();
  if (error || !data) throw new Error("Could not change organization archive status");
  revalidatePath("/admin/organizations");
  revalidatePath("/admin/projects");
}

export async function saveProject(form: FormData) {
  const id = field(form, "id") ? uuid.parse(field(form, "id")) : null;
  const input = projectInput.parse({
    organizationId: field(form, "organizationId"), name: field(form, "name"), slug: field(form, "slug"),
    location: field(form, "location"), description: field(form, "description"),
    coverImageUrl: field(form, "coverImageUrl"), isPublic: field(form, "isPublic") === "on",
  });
  const principal = await getPrincipal();
  const user = await getUserClient();
  if (id) {
    const { data: project } = await user.from("projects").select("id,organization_id").eq("id", id).maybeSingle();
    if (!project || project.organization_id !== input.organizationId ||
      !(await authorize(principal, { projectId: id, segmentId: "00000000-0000-0000-0000-000000000000" }, "admin_manage"))) {
      throw new Error("Project not found");
    }
    const { error } = await user.from("projects").update({ name: input.name, slug: input.slug,
      location: input.location || null, description: input.description || null,
      cover_image_url: input.coverImageUrl, is_public: input.isPublic }).eq("id", id);
    if (error) throw new Error(error.code === "23505" ? "Project slug already exists" : "Could not save project");
  } else {
    if (!authorizeAdminOrganization(principal, input.organizationId)) throw new Error("Not authorized");
    const { data: org } = await user.from("organizations").select("id").eq("id", input.organizationId)
      .is("archived_at", null).maybeSingle();
    if (!org) throw new Error("Organization not found");
    const { error } = await user.from("projects").insert({ organization_id: input.organizationId,
      name: input.name, slug: input.slug, location: input.location || null,
      description: input.description || null, cover_image_url: input.coverImageUrl, is_public: input.isPublic });
    if (error) throw new Error(error.code === "23505" ? "Project slug already exists" : "Could not create project");
  }
  revalidatePath("/admin/projects");
}

export async function setProjectArchived(form: FormData) {
  const id = uuid.parse(field(form, "id"));
  const archived = z.enum(["true", "false"]).parse(field(form, "archived")) === "true";
  const principal = await getPrincipal();
  if (!(await authorize(principal, { projectId: id, segmentId: "00000000-0000-0000-0000-000000000000" }, "admin_manage"))) {
    throw new Error("Project not found");
  }
  const user = await getUserClient();
  const { data, error } = await user.from("projects").update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id).select("id").maybeSingle();
  if (error || !data) throw new Error("Could not change project archive status");
  revalidatePath("/admin/projects");
  revalidatePath("/projects");
}

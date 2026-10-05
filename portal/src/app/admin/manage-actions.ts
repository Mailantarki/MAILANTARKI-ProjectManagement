"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getPrincipal } from "@/lib/auth/principal";
import { authorize, authorizeAdminOrganization, authorizeSuperAdmin } from "@/lib/auth/authorize";
import { getUserClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";

const uuid = z.uuid();
const organizationInput = z.object({
  name: z.string().trim().min(2).max(120),
});
const projectInput = z.object({
  organizationId: uuid,
  name: z.string().trim().min(2).max(160),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100),
  location: z.string().trim().max(160),
  description: z.string().trim().max(2000),
  isPublic: z.boolean(),
});

const MAX_COVER_SIZE = 5 * 1024 * 1024;
function coverType(bytes: Uint8Array) {
  if (bytes.length >= 8 && [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a].every((byte, i) => bytes[i] === byte)) {
    return { mime: "image/png", extension: "png" };
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: "image/jpeg", extension: "jpg" };
  }
  if (bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP") {
    return { mime: "image/webp", extension: "webp" };
  }
  return null;
}

async function uploadCover(file: File, owner: string, folder = "projects") {
  if (file.size <= 0 || file.size > MAX_COVER_SIZE) throw new Error("Cover image must be 5 MB or smaller");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = coverType(bytes);
  if (!type) throw new Error("Cover image must be a valid JPEG, PNG or WebP file");
  const path = `${folder}/${owner}/${randomUUID()}.${type.extension}`;
  const { error } = await getAdminClient().storage.from("project-covers")
    .upload(path, bytes, { contentType: type.mime, upsert: false });
  if (error) throw new Error("Could not upload cover image");
  return path;
}

async function removeCover(path: string | null) {
  if (!path || path.startsWith("http://") || path.startsWith("https://")) return;
  await getAdminClient().storage.from("project-covers").remove([path]);
}

function field(form: FormData, name: string) {
  return form.get(name);
}

export async function saveOrganization(form: FormData) {
  const id = field(form, "id") ? uuid.parse(field(form, "id")) : null;
  const input = organizationInput.parse({ name: field(form, "name") });
  const principal = await getPrincipal();
  if (id ? !authorizeAdminOrganization(principal, id) : !authorizeSuperAdmin(principal)) throw new Error("Not authorized");
  const user = await getUserClient();
  const existing = id ? await user.from("organizations").select("id,logo_url").eq("id", id).maybeSingle() : null;
  if (id && !existing?.data) throw new Error("Organization not found");
  const owner = id ?? randomUUID();
  const supplied = field(form, "logoImage");
  const file = supplied instanceof File && supplied.size > 0 ? supplied : null;
  const previous = existing?.data?.logo_url ?? null;
  const next = file ? await uploadCover(file, owner, "organizations") : field(form, "removeLogo") === "true" ? null : previous;
  const values = { name: input.name, logo_url: next };
  const result = id
    ? await user.from("organizations").update(values).eq("id", id).select("id").maybeSingle()
    : await user.from("organizations").insert(values).select("id").single();
  if (result.error || !result.data) {
    if (file) await removeCover(next);
    throw new Error(result.error?.code === "23505" ? "Organization name already exists" : "Could not save organization");
  }
  if (next !== previous) await removeCover(previous);
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
    isPublic: field(form, "isPublic") === "on",
  });
  const suppliedCover = field(form, "coverImage");
  const cover = suppliedCover instanceof File && suppliedCover.size > 0 ? suppliedCover : null;
  const shouldRemoveCover = field(form, "removeCover") === "true";
  const principal = await getPrincipal();
  const user = await getUserClient();
  if (id) {
    const { data: project } = await user.from("projects").select("id,organization_id,cover_image_url").eq("id", id).maybeSingle();
    if (!project || project.organization_id !== input.organizationId ||
      !(await authorize(principal, { projectId: id, segmentId: "00000000-0000-0000-0000-000000000000" }, "admin_manage"))) {
      throw new Error("Project not found");
    }
    const nextCover = cover ? await uploadCover(cover, id) : shouldRemoveCover ? null : project.cover_image_url;
    const { error } = await user.from("projects").update({ name: input.name, slug: input.slug,
      location: input.location || null, description: input.description || null,
      cover_image_url: nextCover, is_public: input.isPublic }).eq("id", id);
    if (error) {
      if (cover) await removeCover(nextCover);
      throw new Error(error.code === "23505" ? "Project slug already exists" : "Could not save project");
    }
    if (nextCover !== project.cover_image_url) await removeCover(project.cover_image_url);
  } else {
    if (!authorizeAdminOrganization(principal, input.organizationId)) throw new Error("Not authorized");
    const { data: org } = await user.from("organizations").select("id").eq("id", input.organizationId)
      .is("archived_at", null).maybeSingle();
    if (!org) throw new Error("Organization not found");
    const nextCover = cover ? await uploadCover(cover, input.organizationId) : null;
    const { error } = await user.from("projects").insert({ organization_id: input.organizationId,
      name: input.name, slug: input.slug, location: input.location || null,
      description: input.description || null, cover_image_url: nextCover, is_public: input.isPublic });
    if (error) {
      if (nextCover) await removeCover(nextCover);
      throw new Error(error.code === "23505" ? "Project slug already exists" : "Could not create project");
    }
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

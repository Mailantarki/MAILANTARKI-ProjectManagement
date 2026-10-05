"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorize } from "@/lib/auth/authorize";
import { getPrincipal } from "@/lib/auth/principal";
import { getAdminClient } from "@/lib/supabase/admin";
import { getUserClient } from "@/lib/supabase/server";

const MAX_COVER_SIZE = 5 * 1024 * 1024;
const requestSchema = z.object({
  projectId: z.uuid(),
  size: z.number().int().min(1).max(MAX_COVER_SIZE),
  mime: z.enum(["image/jpeg", "image/png", "image/webp"]),
});
const finishSchema = z.object({ projectId: z.uuid(), path: z.string().max(300) });

function imageType(bytes: Uint8Array) {
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

async function canManage(projectId: string) {
  return authorize(await getPrincipal(), {
    projectId, segmentId: "00000000-0000-0000-0000-000000000000",
  }, "admin_manage");
}

export async function prepareProjectCoverUpload(input: unknown) {
  const values = requestSchema.parse(input);
  if (!(await canManage(values.projectId))) throw new Error("Project not found");
  const extension = values.mime === "image/png" ? "png" : values.mime === "image/webp" ? "webp" : "jpg";
  const path = `projects/${values.projectId}/${randomUUID()}.${extension}`;
  const { data, error } = await getAdminClient().storage.from("project-covers").createSignedUploadUrl(path);
  if (error || !data) throw new Error("Could not prepare cover upload");
  return { path, token: data.token };
}

export async function finalizeProjectCoverUpload(input: unknown) {
  const values = finishSchema.parse(input);
  if (!(await canManage(values.projectId)) || !values.path.startsWith(`projects/${values.projectId}/`)) {
    throw new Error("Project not found");
  }
  const storage = getAdminClient().storage.from("project-covers");
  const { data: info, error: infoError } = await storage.info(values.path);
  if (infoError || !info || !Number.isInteger(info.size) || info.size! <= 0 || info.size! > MAX_COVER_SIZE) {
    await storage.remove([values.path]);
    throw new Error("Uploaded cover was not found or is too large");
  }
  const { data: file, error: downloadError } = await storage.download(values.path);
  const bytes = downloadError || !file ? null : new Uint8Array(await file.arrayBuffer());
  const detected = bytes ? imageType(bytes) : null;
  if (!detected) {
    await storage.remove([values.path]);
    throw new Error("Uploaded cover is not a valid JPEG, PNG or WebP image");
  }

  const user = await getUserClient();
  const { data: project } = await user.from("projects").select("cover_image_url").eq("id", values.projectId).maybeSingle();
  if (!project) {
    await storage.remove([values.path]);
    throw new Error("Project not found");
  }
  const { data: updated, error } = await user.from("projects").update({ cover_image_url: values.path })
    .eq("id", values.projectId).select("id").maybeSingle();
  if (error || !updated) {
    await storage.remove([values.path]);
    throw new Error("Could not save cover image");
  }
  const oldPath = project.cover_image_url;
  if (oldPath && !/^https?:\/\//.test(oldPath) && oldPath !== values.path) await storage.remove([oldPath]);
  revalidatePath("/admin/projects");
  revalidatePath("/projects");
  return { path: values.path };
}

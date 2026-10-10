"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getPrincipal } from "@/lib/auth/principal";
import { searchScope } from "@/lib/documents/list";
import { getUserClient } from "@/lib/supabase/server";

/** Turns publish emails for one project on or off for the signed-in user. */
export async function setWatching(input: unknown) {
  const { projectId, enabled } = z.object({ projectId: z.uuid(), enabled: z.boolean() }).parse(input);
  const principal = await getPrincipal();
  if (!principal || principal.kind !== "user") throw new Error("Not authorized");
  const { projects } = await searchScope(principal);
  const project = projects.find((p) => p.id === projectId);
  if (!project) throw new Error("Not authorized");
  const { error } = await (await getUserClient()).from("project_watchers")
    .upsert({ user_id: principal.userId, project_id: projectId, enabled, updated_at: new Date().toISOString() });
  if (error) throw new Error("Could not save this setting");
  revalidatePath(`/projects/${project.slug}`);
  return { enabled };
}

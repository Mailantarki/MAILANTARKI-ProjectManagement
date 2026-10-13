import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
let service: SupabaseClient;
let session: SupabaseClient;
// Unlike list.integration.test.ts, the user client here is a real member session under RLS.
vi.mock("../supabase/admin", () => ({ getAdminClient: () => service }));
vi.mock("../supabase/server", () => ({ getUserClient: async () => session }));
vi.mock("../storage/signed-urls", () => ({ isStoragePath: () => false, signStorageUrls: async () => new Map() }));
import { projectDocuments, visibleProjects } from "./list";

function local() {
  const status = execFileSync("npx", ["supabase", "status", "-o", "env"], { encoding: "utf8" });
  return Object.fromEntries(status.trim().split("\n").map((line) => {
    const index = line.indexOf("=");
    return [line.slice(0, index), line.slice(index + 1).replace(/^"|"$/g, "")];
  }));
}

describe("member session against local Supabase", () => {
  it("lists the granted project and its documents with the member's own RLS session", async () => {
    const env = local();
    service = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: org } = await service.from("organizations").select("id").eq("name", "MAILANTARKI.COM").single();
    const { data: architecture } = await service.from("segments").select("id").eq("slug", "architecture").single();
    const slug = `member-fixture-${randomUUID()}`;
    const { data: project, error: projectError } = await service.from("projects")
      .insert({ name: "Member fixture", slug, organization_id: org!.id }).select("id").single();
    if (projectError) throw projectError;
    const email = `member-${randomUUID()}@example.test`, password = randomBytes(24).toString("base64url");
    const auth = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (auth.error) throw auth.error;
    const userId = auth.data.user.id;
    const docId = randomUUID();
    try {
      await service.from("profiles").insert({ id: userId, organization_id: org!.id, role: "member", full_name: "Member fixture" }).throwOnError();
      await service.from("user_project_access").insert({ user_id: userId, project_id: project.id, segment_id: architecture!.id }).throwOnError();
      await service.from("documents").insert({
        id: docId, project_id: project.id, segment_id: architecture!.id, doc_type: "plan", status: "draft", revision: "A",
        title: "Member plan", doc_number: "A-100", file_path: `projects/${project.id}/architecture/${docId}.pdf`,
        file_size: 10, upload_status: "ready",
      }).throwOnError();
      session = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      const signIn = await session.auth.signInWithPassword({ email, password });
      if (signIn.error) throw signIn.error;

      const member = { kind: "user" as const, userId, role: "member" as const, organizationId: org!.id };
      const projects = await visibleProjects(member);
      expect(projects.find((p) => p.slug === slug)?.segments.map((s) => s.slug)).toEqual(["architecture"]);
      const view = await projectDocuments(member, slug, {});
      expect(view?.documents.map((d) => d.id)).toEqual([docId]);
    } finally {
      await service.from("documents").delete().eq("id", docId);
      await service.from("user_project_access").delete().eq("user_id", userId);
      await service.from("profiles").delete().eq("id", userId);
      await service.auth.admin.deleteUser(userId);
      await service.from("projects").delete().eq("id", project.id);
    }
  });
});

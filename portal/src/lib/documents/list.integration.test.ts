import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
let client: SupabaseClient;
vi.mock("../supabase/admin", () => ({ getAdminClient: () => client }));
vi.mock("../supabase/server", () => ({ getUserClient: async () => client }));
import { parseFilters, projectDocuments } from "./list";

function localClient() {
  const status = execFileSync("npx", ["supabase", "status", "-o", "env"], { encoding: "utf8" });
  const values = Object.fromEntries(status.trim().split("\n").map((line) => {
    const index = line.indexOf("=");
    return [line.slice(0, index), line.slice(index + 1).replace(/^"|"$/g, "")];
  }));
  return createClient(values.API_URL, values.SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } });
}

describe("projectDocuments against local Postgres", () => {
  it("returns exact filtered subsets and never crosses a visitor's segment grant", async () => {
    client = localClient();
    const { data: org, error: orgError } = await client.from("organizations")
      .select("id").eq("name", "MAILANTARKI.COM").single();
    if (orgError) throw orgError;
    const { data: segments, error: segmentError } = await client.from("segments")
      .select("id,slug").in("slug", ["architecture", "mep"]);
    if (segmentError) throw segmentError;
    const architecture = segments!.find((s) => s.slug === "architecture")!.id;
    const mep = segments!.find((s) => s.slug === "mep")!.id;
    const slug = `filter-fixture-${randomUUID()}`;
    const { data: project, error: projectError } = await client.from("projects")
      .insert({ name: "Filter fixture", slug, organization_id: org.id })
      .select("id").single();
    if (projectError) throw projectError;
    const codeId = randomUUID();
    const ids = Array.from({ length: 8 }, () => randomUUID());
    const rows = [
      [architecture, "plan", "draft", "A", "2026-01-10", "North lobby", "A-01"],
      [architecture, "plan", "issued_for_construction", "B", "2026-02-10", "South lobby", "A-02"],
      [architecture, "report", "draft", "B", "2026-03-10", "North facade", "A-03"],
      [architecture, "section", "for_review", "A", "2026-04-10", "East section", "A-04"],
      [architecture, "plan", "draft", "C", "2026-05-10", "Roof plan", "A-05"],
      [mep, "plan", "draft", "A", "2026-01-15", "North duct", "M-01"],
      [mep, "report", "issued_for_construction", "B", "2026-03-15", "Pump report", "M-02"],
      [mep, "section", "draft", "A", "2026-05-15", "North pipe", "M-03"],
    ] as const;
    try {
      const { error: insertError } = await client.from("documents").insert(rows.map((row, index) => ({
        id: ids[index], project_id: project.id, segment_id: row[0], doc_type: row[1], status: row[2],
        revision: row[3], issue_date: row[4], title: row[5], doc_number: row[6],
        file_path: `projects/${project.id}/${row[0] === mep ? "mep" : "architecture"}/${ids[index]}.pdf`,
        file_size: 123, upload_status: "ready",
      })));
      if (insertError) throw insertError;
      const { error: codeError } = await client.from("access_codes").insert({
        id: codeId, organization_id: org.id, code_hash: randomBytes(32).toString("hex"),
        label: "filter fixture", is_active: true,
      });
      if (codeError) throw codeError;
      const { error: grantError } = await client.from("access_code_grants")
        .insert({ access_code_id: codeId, project_id: project.id, segment_id: mep });
      if (grantError) throw grantError;

      const admin = { kind: "user" as const, userId: randomUUID(), role: "super_admin" as const, organizationId: null };
      const visitor = { kind: "visitor" as const, accessCodeId: codeId };
      const check = async (principal: typeof admin | typeof visitor, input: Record<string, string>, expected: number[]) => {
        const view = await projectDocuments(principal, slug, parseFilters(input));
        expect(view?.documents.map((d) => d.id).sort()).toEqual(expected.map((i) => ids[i]).sort());
      };
      await check(admin, {}, [0, 1, 2, 3, 4]);
      await check(admin, { segment: "mep" }, [5, 6, 7]);
      await check(admin, { type: "plan" }, [0, 1, 4]);
      await check(admin, { status: "draft" }, [0, 2, 4]);
      await check(admin, { revision: "B" }, [1, 2]);
      await check(admin, { from: "2026-02-01", to: "2026-04-01" }, [1, 2]);
      await check(admin, { q: "north" }, [0, 2]);
      await check(admin, { type: "plan", status: "draft" }, [0, 4]);
      await check(admin, { type: "plan", revision: "B", from: "2026-02-01" }, [1]);
      await check(visitor, {}, [5, 6, 7]);
      await check(visitor, { segment: "mep", type: "plan", q: "north" }, [5]);
      await check(visitor, { segment: "architecture", status: "draft" }, [5, 7]);
      await check(visitor, { segment: "all", q: "north" }, [5, 7]);
      await check(admin, { type: "wrong-value", status: "draft" }, [0, 2, 4]);
      expect((await projectDocuments(visitor, slug, {}))?.project.segments.map((s) => s.slug)).toEqual(["mep"]);
    } finally {
      await client.from("access_code_grants").delete().eq("access_code_id", codeId);
      await client.from("access_codes").delete().eq("id", codeId);
      await client.from("documents").delete().eq("project_id", project.id);
      await client.from("projects").delete().eq("id", project.id);
    }
  }, 60_000);
});

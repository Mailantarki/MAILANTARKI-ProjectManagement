import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { revisionSortKey } from "./revision";
import { EQUIVALENT_REVISIONS, ORDERED_REVISIONS } from "./revision-cases";

function service() {
  const status = execFileSync("npx", ["supabase", "status", "-o", "env"], { encoding: "utf8" });
  const values = Object.fromEntries(status.trim().split("\n").map((line) => {
    const index = line.indexOf("=");
    return [line.slice(0, index), line.slice(index + 1).replace(/^"|"$/g, "")];
  }));
  return createClient(values.API_URL, values.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

describe("revision order matches the database", () => {
  it("produces the same key as public.revision_sort_key for every shared case", async () => {
    const client = service();
    const cases = [...ORDERED_REVISIONS, ...EQUIVALENT_REVISIONS.flat(), "Revo", "r1", "A-1-b"];
    for (const revision of cases) {
      const { data, error } = await client.rpc("revision_sort_key", { p_revision: revision });
      if (error) throw error;
      expect(data ?? "", revision).toBe(revisionSortKey(revision));
    }
  });
});

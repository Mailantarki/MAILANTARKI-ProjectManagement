import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

function localSupabase() {
  const status = execFileSync("npx", ["supabase", "status", "-o", "env"], { encoding: "utf8" });
  const values = Object.fromEntries(status.trim().split("\n").map((line) => {
    const index = line.indexOf("=");
    return [line.slice(0, index), line.slice(index + 1).replace(/^"|"$/g, "")];
  }));
  return createClient(values.API_URL, values.SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } });
}

describe("atomic code redemption against local Supabase", () => {
  it("lets only one of two concurrent redemptions use a single-use code", async () => {
    const client = localSupabase();
    const { data: org, error: orgError } = await client.from("organizations")
      .select("id").eq("name", "MAILANTARKI.COM").single();
    if (orgError) throw orgError;
    const hash = randomBytes(32).toString("hex");
    const { data: code, error: createError } = await client.from("access_codes")
      .insert({ organization_id: org.id, code_hash: hash, label: "integration-single-use", max_uses: 1 })
      .select("id").single();
    if (createError) throw createError;
    try {
      const [first, second] = await Promise.all([
        client.rpc("redeem_access_code", { p_hash: hash }),
        client.rpc("redeem_access_code", { p_hash: hash }),
      ]);
      expect(first.error).toBeNull(); expect(second.error).toBeNull();
      expect((first.data?.length ?? 0) + (second.data?.length ?? 0)).toBe(1);
      const { data: final } = await client.from("access_codes")
        .select("uses_count").eq("id", code.id).single();
      expect(final?.uses_count).toBe(1);
    } finally {
      await client.from("access_codes").delete().eq("id", code.id);
    }
  });
  it("reserves at most five concurrent attempts for one IP", async () => {
    const client = localSupabase();
    const ip = `127.42.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 200) + 1}`;
    try {
      const results = await Promise.all(Array.from({ length: 6 }, () =>
        client.rpc("reserve_auth_attempt", { p_kind: "code", p_ip: ip })));
      expect(results.every((result) => !result.error)).toBe(true);
      expect(results.filter((result) => result.data !== null).length).toBe(5);
    } finally {
      await client.from("auth_attempts").delete().eq("ip", ip);
    }
  });
});

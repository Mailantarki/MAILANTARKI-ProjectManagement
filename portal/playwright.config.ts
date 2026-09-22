import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";

const status = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? "" : execFileSync("npx", ["supabase", "status", "-o", "env"], { encoding: "utf8" });
const values = Object.fromEntries(status.trim().split("\n").filter(Boolean).map((line) => {
  const index = line.indexOf("=");
  return [line.slice(0, index), line.slice(index + 1).replace(/^"|"$/g, "")];
}));
const env = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? values.API_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? values.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? values.SERVICE_ROLE_KEY,
  ACCESS_CODE_PEPPER: process.env.ACCESS_CODE_PEPPER ?? randomBytes(32).toString("hex"),
  VISITOR_SESSION_SECRET: process.env.VISITOR_SESSION_SECRET ?? randomBytes(32).toString("hex"),
};
Object.assign(process.env, env);

export default defineConfig({
  testDir: "./e2e", fullyParallel: false, workers: 1, retries: 0,
  timeout: 60_000, expect: { timeout: 20_000 },
  use: { baseURL: "http://localhost:3107", ...devices["Desktop Chrome"] },
  webServer: {
    command: "npm run build && npx next start -p 3107", url: "http://localhost:3107",
    reuseExistingServer: false, timeout: 120_000, env,
  },
});

import { createHmac } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { input, password } from "@inquirer/prompts";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { generateCode } from "../src/lib/access-codes/generate";

const envVariableNames = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "ACCESS_CODE_PEPPER"];
const rawArgs = process.argv.slice(2);
let envFile: string | undefined;
for (let index = 0; index < rawArgs.length; index++) {
  if (rawArgs[index] !== "--env-file") throw new Error("Usage: --env-file <path>");
  const path = rawArgs[index + 1];
  if (envFile || !path || path.startsWith("--"))
    throw new Error("Usage: --env-file <path> (at most once)");
  envFile = path;
  index++;
}
if (envFile) {
  for (const name of envVariableNames) delete process.env[name];
  process.loadEnvFile(resolve(envFile));
} else if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}
const cliEnv = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().refine(
    (value) => value.startsWith("sb_publishable_") || value.startsWith("eyJ"),
    "Set the Supabase publishable/anon key for the selected environment",
  ),
  ACCESS_CODE_PEPPER: z.string().min(32),
}).parse(process.env);

async function confirmTargetHost() {
  const host = new URL(cliEnv.NEXT_PUBLIC_SUPABASE_URL).host;
  console.log(host);
  const confirmation = await input({ message: "Escribí el host mostrado para confirmar:" });
  if (confirmation !== host) throw new Error("Destino no confirmado; operación cancelada.");
}

async function main() {
  await confirmTargetHost();
  const email = z.email().parse(await input({ message: "Admin email:" }));
  const secret = await password({ message: "Admin password:", mask: "*" });
  const client = createClient(cliEnv.NEXT_PUBLIC_SUPABASE_URL, cliEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: session, error: signInError } = await client.auth.signInWithPassword({ email, password: secret });
  if (signInError || !session.user) throw new Error("Invalid email or password");
  const { data: profile, error: profileError } = await client.from("profiles")
    .select("organization_id,role").eq("id", session.user.id).single();
  if (profileError || !profile || profile.role === "member") throw new Error("Not authorized");
  const slugs = (await input({ message: "Project slugs (comma-separated):" })).split(",").map((s) => s.trim());
  const label = z.string().min(1).max(120).parse(await input({ message: "Code label:" }));
  const { data: projects, error } = await client.from("projects").select("id,slug,organization_id")
    .in("slug", slugs).is("archived_at", null);
  if (error || !projects || projects.length !== slugs.length) throw new Error("Project not found");
  const organizationId = profile.organization_id ?? projects[0].organization_id;
  const code = generateCode();
  const hash = createHmac("sha256", cliEnv.ACCESS_CODE_PEPPER)
    .update(code.replace("-", "")).digest("hex");
  const { error: createError } = await client.rpc("create_access_code", {
    p_organization: organizationId, p_hash: hash, p_label: label,
    p_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    p_max_uses: 1, p_allow_download: false, p_project_ids: projects.map((p) => p.id),
  });
  if (createError) throw new Error("Could not create access code");
  console.log(`Access code (shown once): ${code}`);
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "Code creation failed"); process.exitCode = 1; });

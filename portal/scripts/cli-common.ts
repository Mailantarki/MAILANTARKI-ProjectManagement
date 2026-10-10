import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { input, password } from "@inquirer/prompts";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const envVariableNames = [
  "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY",
  "ACCESS_CODE_PEPPER", "VISITOR_SESSION_SECRET",
];
const rawArgs = process.argv.slice(2);
const scriptArgs: string[] = [];
let envFile: string | undefined;
for (let index = 0; index < rawArgs.length; index++) {
  const arg = rawArgs[index];
  if (arg !== "--env-file") {
    scriptArgs.push(arg);
    continue;
  }
  const path = rawArgs[index + 1];
  if (envFile || !path || path.startsWith("--"))
    throw new Error("Usage: --env-file <path> (at most once)");
  envFile = path;
  index++;
}

export const cliArgs = scriptArgs;
if (envFile) {
  for (const name of envVariableNames) delete process.env[name];
  process.loadEnvFile(resolve(envFile));
} else if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const env = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().refine(
    (value) => value.startsWith("sb_secret_") || value.startsWith("eyJ"),
    "Set the Supabase service-role key for the selected environment",
  ),
}).safeParse(process.env);
if (!env.success) {
  throw new Error("Invalid Supabase environment: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
}

export const cliEnv = env.data;
export const admin = createClient(env.data.NEXT_PUBLIC_SUPABASE_URL, env.data.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });

export async function confirmTargetHost() {
  const { host, hostname } = new URL(cliEnv.NEXT_PUBLIC_SUPABASE_URL);
  console.log(host);
  // Local Supabase needs no confirmation, so e2e tests and scripts can run unattended.
  if (hostname === "127.0.0.1" || hostname === "localhost") return;
  const confirmation = await input({ message: "Escribí el host mostrado para confirmar:" });
  if (confirmation !== host) throw new Error("Destino no confirmado; operación cancelada.");
}
export const askEmail = () => input({ message: "Email:" });
export const askName = () => input({ message: "Full name:" });
export const askPassword = () => password({ message: "Password (12+ characters):", mask: "*" });
export const temporaryPassword = () => randomBytes(24).toString("base64url");

export async function createAuthProfile(values: {
  email: string; password: string; fullName: string; role: "super_admin" | "org_admin" | "member";
  organizationId: string | null;
}) {
  const { data, error } = await admin.auth.admin.createUser({
    email: values.email, password: values.password, email_confirm: true,
  });
  if (error || !data.user) throw new Error(`Auth user creation failed: ${error?.message ?? "unknown error"}`);
  const { error: profileError } = await admin.from("profiles").insert({
    id: data.user.id, organization_id: values.organizationId,
    role: values.role, full_name: values.fullName,
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id);
    throw new Error(`Profile creation failed: ${profileError.message}`);
  }
  return data.user.id;
}

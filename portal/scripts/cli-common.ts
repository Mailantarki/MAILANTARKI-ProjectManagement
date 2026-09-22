import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { input, password } from "@inquirer/prompts";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const env = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().refine(
    (value) => value.startsWith("sb_secret_") || value.startsWith("eyJ"),
    "Replace the placeholder with SERVICE_ROLE_KEY from local Supabase status",
  ),
}).safeParse(process.env);
if (!env.success) {
  throw new Error("Invalid .env.local: set NEXT_PUBLIC_SUPABASE_URL and replace SUPABASE_SERVICE_ROLE_KEY with the local Supabase service role key.");
}

export const cliEnv = env.data;
export const admin = createClient(env.data.NEXT_PUBLIC_SUPABASE_URL, env.data.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
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

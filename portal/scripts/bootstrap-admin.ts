import { z } from "zod";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { admin, askEmail, askName, askPassword, createAuthProfile } from "./cli-common";
import { canBootstrap } from "./bootstrap-guard";

async function main() {
  const force = process.argv.includes("--force");
  if (process.argv.some((arg) => arg.startsWith("--") && arg !== "--force"))
    throw new Error("Only --force is supported. Credentials must be prompted interactively.");
  const { count, error } = await admin.from("profiles").select("id", { count: "exact", head: true })
    .eq("role", "super_admin");
  if (error) throw new Error("Could not check existing admins. Verify Supabase is running and SUPABASE_SERVICE_ROLE_KEY in .env.local is valid.");
  if (!canBootstrap(count ?? 0, force)) throw new Error("A super_admin already exists. Pass --force to create another.");
  const email = z.email().parse(await askEmail());
  const fullName = z.string().min(1).max(120).parse(await askName());
  const secret = z.string().min(12).parse(await askPassword());
  const id = await createAuthProfile({ email, password: secret, fullName, role: "super_admin", organizationId: null });
  console.log(`Created super_admin ${id}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Bootstrap failed");
  process.exitCode = 1;
});

import { z } from "zod";
import { admin, askEmail, askName, createAuthProfile, temporaryPassword } from "./cli-common";

function arg(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
async function main() {
  const role = z.enum(["org_admin", "member"]).parse(arg("role") ?? "member");
  const email = z.email().parse(arg("email") ?? await askEmail());
  const fullName = z.string().min(1).max(120).parse(await askName());
  const organization = z.string().min(1).parse(arg("organization") ?? "MAILANTARKI.COM");
  const { data: org, error } = await admin.from("organizations").select("id")
    .ilike("name", organization).is("archived_at", null).maybeSingle();
  if (error || !org) throw new Error("Organization not found");
  const secret = temporaryPassword();
  const id = await createAuthProfile({ email, password: secret, fullName, role, organizationId: org.id });
  console.log(`Created ${role} ${id}. Temporary password (shown once): ${secret}`);
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "User creation failed"); process.exitCode = 1; });

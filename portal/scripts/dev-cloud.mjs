import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const envVariableNames = [
  "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY",
  "ACCESS_CODE_PEPPER", "VISITOR_SESSION_SECRET",
];

for (const name of envVariableNames) delete process.env[name];
process.loadEnvFile(".env.cloud.local");

const missing = envVariableNames.filter((name) => !process.env[name]);
if (missing.length) throw new Error(`Missing required variables: ${missing.join(", ")}`);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!supabaseUrl) throw new Error("Missing required variable: NEXT_PUBLIC_SUPABASE_URL");
const host = new URL(supabaseUrl).host;
if (!host.endsWith(".supabase.co")) throw new Error("Expected a Supabase Cloud URL");

console.log(host);
const prompt = createInterface({ input: process.stdin, output: process.stdout });
const confirmation = await prompt.question("Escribí el host mostrado para confirmar:");
prompt.close();
if (confirmation !== host) throw new Error("Destino no confirmado; operación cancelada.");

const nextCli = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));
const next = spawn(process.execPath, [nextCli, "dev", ...process.argv.slice(2)], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
});
next.on("error", () => {
  console.error("No se pudo iniciar Next.js.");
  process.exitCode = 1;
});
next.on("exit", (/** @type {number | null} */ code) => {
  process.exitCode = code ?? 1;
});

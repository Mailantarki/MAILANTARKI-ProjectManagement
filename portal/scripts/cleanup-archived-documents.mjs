import { createClient } from "@supabase/supabase-js";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_BATCH = 100;
const args = process.argv.slice(2);
const execute = args.includes("--execute");
const limitArg = args.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : MAX_BATCH;

if (args.some((arg) => arg !== "--execute" && !arg.startsWith("--limit="))
  || !Number.isInteger(limit) || limit < 1 || limit > MAX_BATCH) {
  throw new Error("Usage: npm run cleanup:archived -- [--execute] [--limit=1..100]");
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const cutoff = new Date(Date.now() - 30 * DAY_MS).toISOString();
const { data: candidates, error: listError } = await supabase
  .from("documents")
  .select("id,project_id,file_path,archived_at")
  .lt("archived_at", cutoff)
  .order("archived_at", { ascending: true })
  .limit(limit);

if (listError) throw new Error(`Could not list archived documents: ${listError.message}`);

console.log(`${candidates.length} archived document(s) older than 30 days; mode: ${execute ? "execute" : "dry-run"}`);
let failed = 0;

for (const candidate of candidates) {
  const parts = candidate.file_path.split("/");
  const validPath = parts.length === 4 && parts[0] === "projects"
    && parts[1] === candidate.project_id
    && ["architecture-structure", "mep", "landscaping", "interior-design"].includes(parts[2])
    && parts[3] === `${candidate.id}.pdf`;
  if (!validPath) {
    failed += 1;
    console.error(`Unexpected storage path for document ${candidate.id}; manual review required`);
    continue;
  }

  if (!execute) {
    console.log(`Would remove document ${candidate.id}`);
    continue;
  }

  const { error: storageError } = await supabase.storage
    .from("documents")
    .remove([candidate.file_path]);
  if (storageError) {
    failed += 1;
    console.error(`Storage deletion failed for document ${candidate.id}: ${storageError.message}`);
    continue;
  }

  const { data: deleted, error: deleteError } = await supabase
    .from("documents")
    .delete()
    .eq("id", candidate.id)
    .lt("archived_at", cutoff)
    .select("id");
  if (deleteError || deleted?.length !== 1) {
    failed += 1;
    console.error(`Metadata deletion failed for document ${candidate.id}: ${deleteError?.message ?? "record changed"}`);
    continue;
  }

  console.log(`Removed document ${candidate.id}`);
}

if (failed) process.exitCode = 1;

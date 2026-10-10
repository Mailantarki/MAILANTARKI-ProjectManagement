/**
 * Read-only preview of the current-revision backfill (migration 20261010000100_current_revisions).
 * Lists every document number with more than one visible revision and the one that will be current,
 * using the same order as the database. Writes nothing.
 *
 *   npx tsx scripts/preview-current-set.ts --env-file .env.production
 */
import { admin, confirmTargetHost } from "./cli-common";
import { compareRevisions } from "../src/lib/documents/revision";

type Row = {
  id: string; project_id: string; segment_id: string; doc_number: string; revision: string;
  issue_date: string | null; created_at: string; title: string;
};

async function main() {
  await confirmTargetHost();
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from("documents")
      .select("id,project_id,segment_id,doc_number,revision,issue_date,created_at,title")
      .eq("upload_status", "ready").is("archived_at", null).order("id").range(from, from + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const [{ data: projects }, { data: segments }] = await Promise.all([
    admin.from("projects").select("id,name"), admin.from("segments").select("id,name"),
  ]);
  const projectName = new Map((projects ?? []).map((p) => [p.id, p.name]));
  const segmentName = new Map((segments ?? []).map((s) => [s.id, s.name]));

  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const key = `${row.project_id}/${row.segment_id}/${row.doc_number}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  // Same order as public.best_revision: revision, then issue date, then upload time.
  const rank = (a: Row, b: Row) => compareRevisions(b.revision, a.revision)
    || (b.issue_date ?? "").localeCompare(a.issue_date ?? "")
    || b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id);

  let multi = 0;
  for (const group of [...groups.values()].sort((a, b) => a[0].doc_number.localeCompare(b[0].doc_number))) {
    if (group.length < 2) continue;
    multi++;
    const [current, ...earlier] = group.sort(rank);
    console.log(`${projectName.get(current.project_id)} / ${segmentName.get(current.segment_id)} / ${current.doc_number}`);
    console.log(`  current:  Rev ${current.revision}  ${current.issue_date ?? "no issue date"}  ${current.title}`);
    for (const row of earlier) console.log(`  earlier:  Rev ${row.revision}  ${row.issue_date ?? "no issue date"}  ${row.title}`);
  }
  console.log(`\n${rows.length} visible documents, ${groups.size} document numbers, ${multi} with more than one revision.`);
  console.log("Nothing was written. Fix a wrong pick after the migration with \"Make current\" in the admin.");
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });

import { compareRevisions, nextRevision, revisionSortKey } from "./revision";

/**
 * What publishing each file will do, before anything is uploaded (SPEC-ui-ux Fase 2c).
 * Mirrors the database rule in migration 20261010000100_current_revisions: the highest
 * revision of a number is current; a lower one goes to the history. The database decides
 * again on publish, so a stale review can never leave two current revisions.
 */
export type UploadCandidate = { key: string; segmentId: string; docNumber: string; revision: string };
export type ExistingRevision = { segmentId: string; docNumber: string; revision: string; isCurrent: boolean };
export type Classification =
  | { kind: "new_drawing" }
  | { kind: "new_revision"; supersedes: string }
  | { kind: "earlier_revision"; current: string }
  | { kind: "conflict"; existing: string; suggestion: string; inUpload: boolean }
  | { kind: "missing_number" };

export const BLOCKING: Classification["kind"][] = ["conflict", "missing_number"];

const groupKey = (segmentId: string, docNumber: string) => `${segmentId}\u0000${docNumber.trim()}`;

export function classifyUploads(candidates: UploadCandidate[], existing: ExistingRevision[]): Record<string, Classification> {
  const result: Record<string, Classification> = {};
  const byGroup = new Map<string, ExistingRevision[]>();
  for (const row of existing) {
    const key = groupKey(row.segmentId, row.docNumber);
    byGroup.set(key, [...(byGroup.get(key) ?? []), row]);
  }
  const batches = new Map<string, UploadCandidate[]>();
  for (const candidate of candidates) {
    if (!candidate.docNumber.trim()) { result[candidate.key] = { kind: "missing_number" }; continue; }
    const key = groupKey(candidate.segmentId, candidate.docNumber);
    batches.set(key, [...(batches.get(key) ?? []), candidate]);
  }
  for (const [key, batch] of batches) {
    const stored = byGroup.get(key) ?? [];
    const taken = new Map(stored.map((row) => [revisionSortKey(row.revision), row.revision]));
    // Suggest the revision after everything known for this number, including this upload.
    const highest = [...stored.map((r) => r.revision), ...batch.map((c) => c.revision)].sort(compareRevisions).at(-1) ?? "";
    let current = stored.find((row) => row.isCurrent)?.revision ?? null;
    // In upload order of revision, as the database will end up after all of them are published.
    for (const candidate of [...batch].sort((a, b) => compareRevisions(a.revision, b.revision))) {
      const revKey = revisionSortKey(candidate.revision);
      const clash = taken.get(revKey);
      if (clash !== undefined) {
        const inUpload = !stored.some((row) => revisionSortKey(row.revision) === revKey);
        result[candidate.key] = { kind: "conflict", existing: clash, suggestion: nextRevision(highest), inUpload };
        continue;
      }
      taken.set(revKey, candidate.revision);
      if (current === null) { result[candidate.key] = { kind: "new_drawing" }; current = candidate.revision; }
      else if (compareRevisions(candidate.revision, current) > 0) {
        result[candidate.key] = { kind: "new_revision", supersedes: current }; current = candidate.revision;
      } else result[candidate.key] = { kind: "earlier_revision", current };
    }
  }
  return result;
}

export function describeClassification(value: Classification): string {
  switch (value.kind) {
    case "new_drawing": return "New drawing";
    case "new_revision": return `New revision · Rev ${value.supersedes} becomes superseded`;
    case "earlier_revision": return `Earlier revision · added to the history (current is Rev ${value.current})`;
    case "conflict": return value.inUpload
      ? `Conflict: Rev ${value.existing} appears twice in this upload`
      : `Conflict: Rev ${value.existing} already exists`;
    case "missing_number": return "Missing number";
  }
}

"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toaster";
import { saveUserAccess } from "./actions";

type Grant = { project_id: string; segment_id: string | null; can_download: boolean };
type Row = { projectId: string; name: string; mode: "none" | "all" | "some"; segmentIds: string[]; canDownload: boolean };

function initial(projects: { id: string; name: string }[], grants: Grant[]): Row[] {
  return projects.map((project) => {
    const mine = grants.filter((g) => g.project_id === project.id);
    const all = mine.some((g) => g.segment_id === null);
    return { projectId: project.id, name: project.name, mode: !mine.length ? "none" : all ? "all" : "some",
      segmentIds: mine.flatMap((g) => g.segment_id ? [g.segment_id] : []), canDownload: mine.some((g) => g.can_download) };
  });
}

/** Person panel: which projects and disciplines a member sees, and whether they can download. Saved in one step. */
export function AccessMatrix({ userId, projects, segments, grants }: {
  userId: string; projects: { id: string; name: string }[]; segments: { id: string; name: string }[]; grants: Grant[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState(() => initial(projects, grants));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const start = JSON.stringify(initial(projects, grants));
  const dirty = JSON.stringify(rows) !== start;
  const update = (id: string, patch: Partial<Row>) => setRows((old) => old.map((row) => row.projectId === id ? { ...row, ...patch } : row));
  return <form className="access-matrix" onSubmit={async (event) => {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      await saveUserAccess({ userId, projects: rows.map(({ projectId, mode, segmentIds, canDownload }) => ({ projectId, mode, segmentIds, canDownload })) });
      toast("Access saved"); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save access"); }
    finally { setBusy(false); }
  }}>
    {rows.map((row) => <fieldset key={row.projectId} className={`access-project${row.mode === "none" ? " is-off" : ""}`}>
      <legend>{row.name}</legend>
      <div className="access-controls">
        <label>Access<select value={row.mode} onChange={(e) => update(row.projectId, { mode: e.target.value as Row["mode"] })}>
          <option value="none">No access</option><option value="all">All disciplines</option><option value="some">Some disciplines</option>
        </select></label>
        <label>Level<select value={row.canDownload ? "download" : "view"} disabled={row.mode === "none"}
          onChange={(e) => update(row.projectId, { canDownload: e.target.value === "download" })}>
          <option value="view">View only</option><option value="download">View and download</option>
        </select></label>
      </div>
      {row.mode === "some" && <div className="access-segments">{segments.map((segment) => <label key={segment.id} className="check-field">
        <input type="checkbox" checked={row.segmentIds.includes(segment.id)} onChange={(e) => update(row.projectId, {
          segmentIds: e.target.checked ? [...row.segmentIds, segment.id] : row.segmentIds.filter((id) => id !== segment.id) })} />
        {segment.name}</label>)}</div>}
    </fieldset>)}
    {error && <p className="error" role="alert">{error}</p>}
    <div className="access-save"><button className="button" type="submit" disabled={busy || !dirty}>{busy ? "Saving…" : "Save access"}</button>
      {dirty && !busy && <span className="results-count">Unsaved changes</span>}</div>
  </form>;
}

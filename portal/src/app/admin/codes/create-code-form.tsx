"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createAccessCode } from "./actions";

type Grant = { projectId: string; segmentId: string | null };

export function CreateCodeForm({ organizations, projects, segments }: {
  organizations: { id: string; name: string }[];
  projects: { id: string; name: string; organization_id: string }[];
  segments: { id: string; name: string }[];
}) {
  const form = useRef<HTMLFormElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const codeText = useRef<HTMLElement>(null);
  const router = useRouter();
  const [organizationId, setOrganizationId] = useState(organizations[0]?.id ?? "");
  const [grants, setGrants] = useState<Grant[]>([{ projectId: "", segmentId: null }]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const available = projects.filter((project) => project.organization_id === organizationId);
  const changeGrant = (index: number, patch: Partial<Grant>) => setGrants((old) => old.map((grant, i) => i === index ? { ...grant, ...patch } : grant));
  return <><form ref={form} className="admin-form" onSubmit={async (event) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const data = new FormData(form.current!);
      const selected = grants.map((grant) => ({ projectId: grant.projectId, segmentId: grant.segmentId }));
      data.set("grants", JSON.stringify(selected));
      const expires = data.get("expiresAt");
      if (typeof expires === "string" && expires) data.set("expiresAt", new Date(expires).toISOString());
      const result = await createAccessCode(data);
      if (codeText.current) codeText.current.textContent = result.code;
      dialog.current?.showModal();
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create code"); }
    finally { setBusy(false); }
  }}>
    <label className="field">Organization<select name="organizationId" value={organizationId} onChange={(event) => {
      setOrganizationId(event.target.value); setGrants([{ projectId: "", segmentId: null }]);
    }}>{organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}</select></label>
    <label className="field">Label<input name="label" required maxLength={120} /></label>
    <label className="field">Expires at<input name="expiresAt" type="datetime-local" /></label>
    <label className="field">Maximum uses<input name="maxUses" type="number" min={1} max={100000} /></label>
    <label className="check-field"><input name="allowDownload" type="checkbox" /> Allow download</label>
    <div className="admin-grants"><strong>Access grants</strong>{grants.map((grant, index) => <div className="grant-row" key={index}>
      <label className="field">Project<select required value={grant.projectId} onChange={(event) => changeGrant(index, { projectId: event.target.value })}>
        <option value="" disabled>Select project</option>{available.map((project) =>
          <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
      <label className="field">Discipline<select value={grant.segmentId ?? ""} onChange={(event) => changeGrant(index, { segmentId: event.target.value || null })}>
        <option value="">All disciplines</option>{segments.map((segment) =>
          <option key={segment.id} value={segment.id}>{segment.name}</option>)}</select></label>
      {grants.length > 1 && <button type="button" className="button secondary" onClick={() => setGrants((old) => old.filter((_, i) => i !== index))}>Remove</button>}
    </div>)}
      <button className="button secondary" type="button" disabled={grants.length >= 50} onClick={() => setGrants((old) => [...old, { projectId: "", segmentId: null }])}>Add grant</button>
    </div>
    <button className="button" disabled={busy || !available.length}>{busy ? "Creating..." : "Create code"}</button>
    {error && <p role="alert" className="error">{error}</p>}
  </form>
    <dialog ref={dialog} aria-label="Access code created" className="secret-dialog" onClose={() => { if (codeText.current) codeText.current.textContent = ""; }}>
      <h2>Access code created</h2><p>This code is shown only once.</p>
      <code ref={codeText} className="secret-code" />
      <div className="actions"><button type="button" className="button secondary" onClick={async () => {
        const value = codeText.current?.textContent;
        if (value) await navigator.clipboard.writeText(value);
      }}>Copy</button><button type="button" className="button" onClick={() => dialog.current?.close()}>Done</button></div>
    </dialog>
  </>;
}

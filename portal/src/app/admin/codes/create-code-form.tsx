"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Plus, X } from "lucide-react";
import { createAccessCode } from "./actions";
import { formatDateTime } from "@/lib/format";

type Grant = { projectId: string; segmentId: string | null };
type Created = { code: string; label: string; expiresAt: string | null; allowDownload: boolean; grants: string[] };

/** Text an admin can paste into an email or chat for the recipient. */
export function invitationText(created: Created, origin: string) {
  return [
    `You have been given access to project documents on MAILANTARKI.COM (${created.grants.join("; ")}).`,
    "",
    `1. Open ${origin}/`,
    `2. Enter this access code: ${created.code}`,
    "",
    created.expiresAt ? `The code is valid until ${formatDateTime(created.expiresAt)}.` : "The code does not expire.",
    created.allowDownload ? "You can view and download the documents." : "You can view the documents online.",
  ].join("\n");
}

export function CreateCodeForm({ organizations, projects, segments }: {
  organizations: { id: string; name: string }[];
  projects: { id: string; name: string; organization_id: string }[];
  segments: { id: string; name: string }[];
}) {
  const form = useRef<HTMLFormElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [organizationId, setOrganizationId] = useState(organizations[0]?.id ?? "");
  const [grants, setGrants] = useState<Grant[]>([{ projectId: "", segmentId: null }]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const [copied, setCopied] = useState<"" | "code" | "invite">("");
  const available = projects.filter((project) => project.organization_id === organizationId);
  const changeGrant = (index: number, patch: Partial<Grant>) => setGrants((old) => old.map((grant, i) => i === index ? { ...grant, ...patch } : grant));
  const reset = () => { setCreated(null); setCopied(""); setError(""); setGrants([{ projectId: "", segmentId: null }]); form.current?.reset(); };

  // The code is shown only once: forget it whenever the panel closes.
  useEffect(() => {
    const dialog = root.current?.closest("dialog");
    if (!dialog) return;
    const onClose = () => reset();
    dialog.addEventListener("close", onClose);
    return () => dialog.removeEventListener("close", onClose);
  });

  const copy = async (what: "code" | "invite") => {
    if (!created) return;
    await navigator.clipboard.writeText(what === "code" ? created.code : invitationText(created, window.location.origin));
    setCopied(what);
  };

  if (created) {
    return <div ref={root} className="code-created" aria-live="polite">
      <h3>Access code created</h3>
      <p>Copy it now: this code is shown only once and cannot be recovered.</p>
      <code className="secret-code">{created.code}</code>
      <div className="user-actions">
        <button type="button" className="button" onClick={() => void copy("invite")}>
          {copied === "invite" ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}{copied === "invite" ? "Invitation copied" : "Copy invitation"}</button>
        <button type="button" className="button secondary" onClick={() => void copy("code")}>
          {copied === "code" ? "Code copied" : "Copy code"}</button>
      </div>
      <details className="invitation-preview"><summary>Preview invitation</summary><pre>{invitationText(created, typeof window === "undefined" ? "" : window.location.origin)}</pre></details>
      <div className="user-actions code-created-footer">
        <button type="button" className="button secondary" onClick={reset}><Plus size={16} aria-hidden />Create another</button>
        <button type="button" className="button secondary" onClick={() => root.current?.closest("dialog")?.close()}>Done</button>
      </div>
    </div>;
  }

  return <div ref={root}><form ref={form} className="admin-form code-form" onSubmit={async (event) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const data = new FormData(form.current!);
      data.set("grants", JSON.stringify(grants));
      const expires = data.get("expiresAt");
      if (typeof expires === "string" && expires) data.set("expiresAt", new Date(expires).toISOString());
      const result = await createAccessCode(data);
      setCreated({
        code: result.code, label: String(data.get("label") ?? ""),
        expiresAt: typeof data.get("expiresAt") === "string" && data.get("expiresAt") ? String(data.get("expiresAt")) : null,
        allowDownload: data.get("allowDownload") === "on",
        grants: grants.map((grant) => `${available.find((p) => p.id === grant.projectId)?.name ?? "Project"} · ${segments.find((s) => s.id === grant.segmentId)?.name ?? "All disciplines"}`),
      });
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create code"); }
    finally { setBusy(false); }
  }}>
    {organizations.length > 1 && <label className="field">Organization<select name="organizationId" value={organizationId} onChange={(event) => {
      setOrganizationId(event.target.value); setGrants([{ projectId: "", segmentId: null }]);
    }}>{organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}</select></label>}
    {organizations.length === 1 && <input type="hidden" name="organizationId" value={organizationId} />}
    <label className="field">Label<input name="label" required maxLength={120} placeholder="e.g. Client review — Maylan Plaza" /></label>
    <fieldset className="admin-grants"><legend>Access</legend>{grants.map((grant, index) => <div className="grant-row" key={index}>
      <label className="field">Project<select required value={grant.projectId} onChange={(event) => changeGrant(index, { projectId: event.target.value })}>
        <option value="" disabled>Select project</option>{available.map((project) =>
          <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
      <label className="field">Discipline<select value={grant.segmentId ?? ""} onChange={(event) => changeGrant(index, { segmentId: event.target.value || null })}>
        <option value="">All disciplines</option>{segments.map((segment) =>
          <option key={segment.id} value={segment.id}>{segment.name}</option>)}</select></label>
      {grants.length > 1 && <button type="button" className="user-icon" aria-label="Remove this project" onClick={() => setGrants((old) => old.filter((_, i) => i !== index))}><X size={16} aria-hidden /></button>}
    </div>)}
      <button className="link-button" type="button" disabled={grants.length >= 50} onClick={() => setGrants((old) => [...old, { projectId: "", segmentId: null }])}><Plus size={15} aria-hidden />Add another project</button>
    </fieldset>
    <label className="field">Expires at<input name="expiresAt" type="datetime-local" /><span className="field-hint">Leave empty for no expiry.</span></label>
    <label className="field">Maximum uses<input name="maxUses" type="number" min={1} max={100000} placeholder="Unlimited" /></label>
    <label className="check-field"><input name="allowDownload" type="checkbox" /> Allow download</label>
    {error && <p role="alert" className="form-alert">{error}</p>}
    <button className="button" disabled={busy || !available.length}>{busy ? "Creating..." : "Create code"}</button>
  </form></div>;
}

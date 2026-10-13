"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Check } from "lucide-react";
import { createUser } from "./actions";

export function CreateUserForm({ organizations, canCreateSuper }: {
  organizations: { id: string; name: string }[]; canCreateSuper: boolean;
}) {
  const secret = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [role, setRole] = useState("member");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [copyError, setCopyError] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  return <><form className="user-stacked-form" onSubmit={async (event) => {
    event.preventDefault(); if (busy) return;
    const form = event.currentTarget;
    setBusy(true); setError(""); setPassword(""); setCopied(false); setCopyError("");
    try {
      const result = await createUser(new FormData(form));
      form.reset(); setRole("member"); setPassword(result.password); secret.current?.showModal(); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create user"); }
    finally { setBusy(false); }
  }}>
    <label className="field">Email<input name="email" type="email" required maxLength={320} autoComplete="off" /></label>
    <label className="field">Full name<input name="fullName" required maxLength={120} /></label>
    <label className="field">Role<select name="role" value={role} onChange={(event) => setRole(event.target.value)}>
      <option value="member">Member</option><option value="org_admin">Organization admin</option>
      {canCreateSuper && <option value="super_admin">Super admin</option>}
    </select></label>
    {role !== "super_admin" && (canCreateSuper ? <label className="field">Organization<select name="organizationId" required>
      {organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
    </select></label> : <div className="field"><span>Organization</span><strong>{organizations[0]?.name ?? "Unavailable"}</strong>
      <input type="hidden" name="organizationId" value={organizations[0]?.id ?? ""} /></div>)}
    {role === "super_admin" && <input type="hidden" name="organizationId" value="" />}
    <button className="button" disabled={busy || (role !== "super_admin" && !organizations.length)}>{busy ? "Creating..." : "Create user"}</button>
    {error && <p role="alert" className="error">{error}</p>}
  </form>
    <dialog className="user-dialog" ref={secret} aria-label="Temporary password" onClose={() => { setPassword(""); setCopied(false); }}>
      <h2>Temporary password</h2><p>Shown once. Share it securely. The user must change it at first sign-in.</p>
      <code className="secret-code">{password}</code>
      <div className="user-actions"><button type="button" className="button secondary" onClick={async () => {
        try { await navigator.clipboard.writeText(password); setCopied(true); setCopyError(""); }
        catch { setCopyError("Clipboard unavailable. Select the password to copy it."); }
      }}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "Copied" : "Copy password"}</button>
      <button className="button" type="button" onClick={() => secret.current?.close()}>Done</button></div>
      {copyError && <p role="alert">{copyError}</p>}
    </dialog>
  </>;
}

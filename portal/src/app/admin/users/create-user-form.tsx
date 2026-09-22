"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createUser } from "./actions";

export function CreateUserForm({ organizations, canCreateSuper }: {
  organizations: { id: string; name: string }[];
  canCreateSuper: boolean;
}) {
  const form = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const [role, setRole] = useState("member");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return <form ref={form} className="admin-form" onSubmit={async (event) => {
    event.preventDefault(); setBusy(true); setError(""); setPassword("");
    try {
      const result = await createUser(new FormData(form.current!));
      form.current?.reset(); setRole("member"); setPassword(result.password); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create user"); }
    finally { setBusy(false); }
  }}>
    <label className="field">Email<input name="email" type="email" required maxLength={320} /></label>
    <label className="field">Full name<input name="fullName" required maxLength={120} /></label>
    <label className="field">Role<select name="role" value={role} onChange={(event) => setRole(event.target.value)}>
      <option value="member">Member</option><option value="org_admin">Organization admin</option>
      {canCreateSuper && <option value="super_admin">Super admin</option>}
    </select></label>
    {role !== "super_admin" && <label className="field">Organization<select name="organizationId" required>
      {organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
    </select></label>}
    {role === "super_admin" && <input type="hidden" name="organizationId" value="" />}
    <button className="button" disabled={busy || (role !== "super_admin" && !organizations.length)}>
      {busy ? "Creating..." : "Create user"}
    </button>
    {error && <p role="alert" className="error">{error}</p>}
    {password && <div className="one-time-secret" role="status">
      <strong>Temporary password</strong><p>Shown once. Give it to the user securely.</p>
      <code>{password}</code><button type="button" className="button secondary" onClick={() => setPassword("")}>Dismiss</button>
    </div>}
  </form>;
}

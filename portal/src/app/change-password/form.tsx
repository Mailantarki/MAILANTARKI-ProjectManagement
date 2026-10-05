"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { changeInitialPassword } from "./actions";

export function PasswordForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  return <form className="user-stacked-form" onSubmit={async (event) => {
    event.preventDefault(); if (busy) return;
    const form = new FormData(event.currentTarget); setBusy(true); setError("");
    try { await changeInitialPassword(form); router.replace("/projects"); router.refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not change password"); }
    finally { setBusy(false); }
  }}>
    <label className="field">New password<input type="password" name="password" autoComplete="new-password" required minLength={12} maxLength={128} /></label>
    <label className="field">Confirm password<input type="password" name="confirm" autoComplete="new-password" required minLength={12} maxLength={128} /></label>
    <button className="button" disabled={busy}>{busy ? "Saving..." : "Save password"}</button>
    {error && <p role="alert" className="error">{error}</p>}
  </form>;
}

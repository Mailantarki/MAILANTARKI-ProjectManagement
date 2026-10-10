"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { changeInitialPassword } from "./actions";
import { PasswordFields } from "@/components/ui/password-fields";

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
    {error && <p role="alert" className="form-alert">{error}</p>}
    <PasswordFields />
    <button className="button" disabled={busy}>{busy ? "Saving..." : "Save password"}</button>
  </form>;
}

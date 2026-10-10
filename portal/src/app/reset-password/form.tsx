"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { resetPassword } from "./actions";
import { PasswordFields } from "@/components/ui/password-fields";

export function ResetPasswordForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <form className="form" onSubmit={async (event) => {
    event.preventDefault(); if (busy) return;
    const form = new FormData(event.currentTarget); setBusy(true); setError("");
    try { await resetPassword(form); router.replace("/projects"); router.refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save the password"); setBusy(false); }
  }}>
    {error && <p className="form-alert" role="alert">{error}</p>}
    <PasswordFields />
    <button className="button" disabled={busy}>{busy ? "Saving…" : "Save password"}</button>
  </form>;
}

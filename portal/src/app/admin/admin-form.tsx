"use client";

import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

export function AdminForm({ action, children, label, confirmMessage }: {
  action: (data: FormData) => Promise<unknown>;
  children: ReactNode;
  label: string;
  confirmMessage?: string;
}) {
  const form = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <form ref={form} className="admin-form" onSubmit={async (event) => {
    event.preventDefault();
    if (busy || (confirmMessage && !window.confirm(confirmMessage))) return;
    setBusy(true); setError("");
    try { await action(new FormData(form.current!)); router.refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save changes"); }
    finally { setBusy(false); }
  }}>
    {children}
    <button className="button" disabled={busy} type="submit">{busy ? "Saving..." : label}</button>
    {error && <p role="alert" className="error">{error}</p>}
  </form>;
}

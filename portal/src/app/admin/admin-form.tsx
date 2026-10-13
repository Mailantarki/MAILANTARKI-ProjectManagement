"use client";

import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "@/components/ui/toaster";

export function AdminForm({ action, children, label, confirmMessage, deleteIcon = false, danger = false, successMessage = "Changes saved" }: {
  action: (data: FormData) => Promise<unknown>;
  children: ReactNode;
  label: string;
  confirmMessage?: string;
  deleteIcon?: boolean;
  /** Destructive action: red button and red confirm button. */
  danger?: boolean;
  successMessage?: string;
  /** @deprecated Every confirmation now uses the in-app dialog. */
  customConfirmation?: boolean;
}) {
  const form = useRef<HTMLFormElement>(null);
  const confirmation = useRef<HTMLDialogElement>(null);
  const pending = useRef<FormData | null>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(data: FormData) {
    if (busy) return;
    setBusy(true); setError("");
    try { await action(data); confirmation.current?.close(); router.refresh(); toast(successMessage); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save changes"); }
    finally { setBusy(false); }
  }
  return <><form ref={form} className="admin-form" onSubmit={async (event) => {
    event.preventDefault(); if (busy) return;
    const data = new FormData(form.current!);
    if (confirmMessage) {
      pending.current = data; setError(""); confirmation.current?.showModal(); return;
    }
    await submit(data);
  }}>
    {children}
    <button className={`button${deleteIcon ? " secondary" : ""}${danger ? " danger" : ""}`} disabled={busy} type="submit"
      aria-label={label} title={deleteIcon ? label : undefined}>{deleteIcon ? <Trash2 size={18} aria-hidden /> : busy ? "Saving..." : label}</button>
    {error && <p role="alert" className="error">{error}</p>}
  </form>{confirmMessage && <dialog ref={confirmation} className="user-dialog confirm-dialog" aria-label={label}
    onCancel={(event) => { if (busy) event.preventDefault(); }} onClose={() => { pending.current = null; }}>
    <h2>{label}</h2><p>{confirmMessage}</p>
    <div className="user-actions confirm-actions"><button className="button secondary" type="button" disabled={busy} onClick={() => confirmation.current?.close()}>Cancel</button>
      <button className={`button${danger ? " danger" : ""}`} type="button" disabled={busy} onClick={() => { if (pending.current) void submit(pending.current); }}>{busy ? "Saving..." : label}</button></div>
    {error && <p role="alert" className="error">{error}</p>}
  </dialog>}</>;
}

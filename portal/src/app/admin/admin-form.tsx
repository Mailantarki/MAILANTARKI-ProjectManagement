"use client";

import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

export function AdminForm({ action, children, label, confirmMessage, deleteIcon = false, customConfirmation = false }: {
  action: (data: FormData) => Promise<unknown>;
  children: ReactNode;
  label: string;
  confirmMessage?: string;
  deleteIcon?: boolean;
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
    try { await action(data); confirmation.current?.close(); router.refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save changes"); }
    finally { setBusy(false); }
  }
  return <><form ref={form} className="admin-form" onSubmit={async (event) => {
    event.preventDefault(); if (busy) return;
    const data = new FormData(form.current!);
    if (confirmMessage && customConfirmation) {
      pending.current = data; setError(""); confirmation.current?.showModal(); return;
    }
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    await submit(data);
  }}>
    {children}
    <button className={`button${deleteIcon ? " secondary" : ""}`} disabled={busy} type="submit"
      aria-label={label} title={deleteIcon ? label : undefined}>{deleteIcon ? <Trash2 size={18} aria-hidden /> : busy ? "Saving..." : label}</button>
    {error && <p role="alert" className="error">{error}</p>}
  </form>{customConfirmation && <dialog ref={confirmation} className="user-dialog" aria-label={label}
    onCancel={(event) => { if (busy) event.preventDefault(); }} onClose={() => { pending.current = null; }}>
    <h2>{label}</h2><p>{confirmMessage}</p>
    <div className="user-actions"><button className="button secondary" type="button" disabled={busy} onClick={() => confirmation.current?.close()}>Cancel</button>
      <button className="button" type="button" disabled={busy} onClick={() => { if (pending.current) void submit(pending.current); }}>{busy ? "Saving..." : "Confirm"}</button></div>
    {error && <p role="alert" className="error">{error}</p>}
  </dialog>}</>;
}

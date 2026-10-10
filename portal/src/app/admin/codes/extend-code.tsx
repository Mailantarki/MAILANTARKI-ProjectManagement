"use client";
import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, X } from "lucide-react";
import { extendAccessCode } from "./actions";
import { toast } from "@/components/ui/toaster";

const DAY = 24 * 60 * 60 * 1000;
const localInput = (time: number) => {
  const date = new Date(time - new Date(time).getTimezoneOffset() * 60000);
  return date.toISOString().slice(0, 16);
};

/** "Extend" for expired codes: pick a new expiry (presets or a date) or remove the expiry. */
export function ExtendCodeButton({ id, label }: { id: string; label: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const router = useRouter();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(expiresAt: string) {
    setBusy(true); setError("");
    const form = new FormData();
    form.set("id", id);
    form.set("expiresAt", expiresAt ? new Date(expiresAt).toISOString() : "");
    try { await extendAccessCode(form); dialog.current?.close(); router.refresh(); toast("Access code extended"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not extend the code"); }
    finally { setBusy(false); }
  }
  return <>
    <button type="button" className="button secondary" onClick={() => { setValue(localInput(Date.now() + 7 * DAY)); dialog.current?.showModal(); }}>
      <CalendarPlus size={15} aria-hidden />Extend</button>
    <dialog ref={dialog} className="user-dialog confirm-dialog" aria-labelledby={titleId}>
      <header><h2 id={titleId}>Extend “{label}”</h2><button type="button" className="user-icon" aria-label="Close" onClick={() => dialog.current?.close()}><X size={20} /></button></header>
      <div className="preset-row">
        {[7, 30, 90].map((days) => <button key={days} type="button" className="button secondary" disabled={busy}
          onClick={() => setValue(localInput(Date.now() + days * DAY))}>{days} days</button>)}
      </div>
      <label className="field">New expiry<input type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} /></label>
      {error && <p className="form-alert" role="alert">{error}</p>}
      <div className="user-actions confirm-actions">
        <button type="button" className="button secondary" disabled={busy} onClick={() => void save("")}>Never expires</button>
        <button type="button" className="button" disabled={busy || !value} onClick={() => void save(value)}>{busy ? "Saving…" : "Extend"}</button>
      </div>
    </dialog>
  </>;
}

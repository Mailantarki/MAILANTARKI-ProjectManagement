"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { Plus, Settings2, X } from "lucide-react";

/**
 * Button + modal. `drawer` slides in from the right (edit panels); `primary` keeps the main-action
 * button style for "New …" panels that also open as a drawer.
 */
export function UserDialog({ title, label, drawer = false, primary = !drawer, defaultOpen = false, children }: {
  title: string; label: string; drawer?: boolean; primary?: boolean;
  /** Opens on load (links such as /admin/users?new=1 from ⌘K). */
  defaultOpen?: boolean; children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => { if (defaultOpen && !dialog.current?.open) dialog.current?.showModal(); }, [defaultOpen]);
  return <>
    <button type="button" className={`button${primary ? "" : " secondary"}`} onClick={() => dialog.current?.showModal()}>
      {primary ? <Plus size={16} aria-hidden /> : <Settings2 size={16} aria-hidden />}{label}
    </button>
    <dialog className={`user-dialog${drawer ? " user-drawer" : ""}`} ref={dialog} aria-labelledby={id}>
      <header><h2 id={id}>{title}</h2><button type="button" className="user-icon" title="Close" aria-label="Close" onClick={() => dialog.current?.close()}><X size={20} /></button></header>
      {children}
    </dialog>
  </>;
}

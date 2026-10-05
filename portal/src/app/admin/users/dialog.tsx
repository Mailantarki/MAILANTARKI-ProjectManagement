"use client";
import { useId, useRef, type ReactNode } from "react";
import { Plus, Settings2, X } from "lucide-react";
export function UserDialog({ title, label, drawer = false, children }: {
  title: string; label: string; drawer?: boolean; children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  return <>
    <button className={`button${drawer ? " secondary" : ""}`} onClick={() => dialog.current?.showModal()}>
      {drawer ? <Settings2 size={16} aria-hidden /> : <Plus size={16} aria-hidden />}{label}
    </button>
    <dialog className={`user-dialog${drawer ? " user-drawer" : ""}`} ref={dialog} aria-labelledby={id}>
      <header><h2 id={id}>{title}</h2><button className="user-icon" title="Close" aria-label="Close" onClick={() => dialog.current?.close()}><X size={20} /></button></header>
      {children}
    </dialog>
  </>;
}

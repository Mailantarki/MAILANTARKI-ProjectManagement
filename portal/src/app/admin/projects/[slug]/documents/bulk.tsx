"use client";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Archive, MoreHorizontal, Star, StarOff, X } from "lucide-react";
import { toast } from "@/components/ui/toaster";
import { bulkUpdateDocuments, undoBulkUpdate } from "./actions";

type Selection = { selected: Set<string>; toggle: (id: string) => void; set: (ids: string[], on: boolean) => void; all: string[] };
const Context = createContext<Selection | null>(null);
const useSelection = () => useContext(Context)!;

/** Wraps the documents table: row checkboxes, "select all" and the floating bar. */
export function BulkSelection({ ids, children }: { ids: string[]; children: ReactNode }) {
  const [selected, setSelected] = useState(new Set<string>());
  const value: Selection = {
    selected, all: ids,
    toggle: (id) => setSelected((old) => { const next = new Set(old); if (next.has(id)) next.delete(id); else next.add(id); return next; }),
    set: (list, on) => setSelected((old) => { const next = new Set(old); for (const id of list) if (on) next.add(id); else next.delete(id); return next; }),
  };
  return <Context.Provider value={value}>{children}<BulkBar /></Context.Provider>;
}

export function SelectRow({ id, label }: { id: string; label: string }) {
  const { selected, toggle } = useSelection();
  return <input type="checkbox" className="bulk-check" checked={selected.has(id)} onChange={() => toggle(id)} aria-label={`Select ${label}`} />;
}

export function SelectAll() {
  const { selected, all, set } = useSelection();
  const box = useRef<HTMLInputElement>(null);
  const count = all.filter((id) => selected.has(id)).length;
  useEffect(() => { if (box.current) box.current.indeterminate = count > 0 && count < all.length; }, [count, all.length]);
  return <input ref={box} type="checkbox" className="bulk-check" checked={all.length > 0 && count === all.length}
    onChange={(e) => set(all, e.target.checked)} aria-label={`Select all ${all.length} drawings`} />;
}

const statuses = [["draft", "Draft"], ["for_review", "For review"], ["issued_for_construction", "Issued for construction"], ["as_built", "As-built"]] as const;

function BulkBar() {
  const { selected, set } = useSelection();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const confirm = useRef<HTMLDialogElement>(null);
  const ids = [...selected];
  if (!ids.length) return null;
  const run = async (patch: Record<string, string | boolean>, done: string) => {
    setBusy(true);
    try {
      const previous = await bulkUpdateDocuments({ ids, patch });
      set(ids, false);
      router.refresh();
      toast(done, { action: { label: "Undo", onClick: async () => {
        try { await undoBulkUpdate(previous); router.refresh(); toast("Undone"); }
        catch { toast("Could not undo", { error: true }); }
      } } });
    } catch (cause) { toast(cause instanceof Error ? cause.message : "Could not update the documents", { error: true }); }
    finally { setBusy(false); confirm.current?.close(); }
  };
  const n = ids.length;
  const noun = `${n} ${n === 1 ? "document" : "documents"}`;
  const archive = () => n > 10 ? confirm.current?.showModal() : void run({ archived: true }, `${noun} archived`);
  return <div className="bulk-bar" role="region" aria-label="Bulk actions">
    <strong>{n} selected</strong>
    <label className="bulk-status"><span className="sr-only">Change status</span>
      <select value="" disabled={busy} onChange={(e) => { if (e.target.value) void run({ status: e.target.value }, `Status changed on ${noun}`); }}>
        <option value="">Change status…</option>
        {statuses.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
      </select></label>
    <button type="button" disabled={busy} onClick={() => void run({ is_featured: true }, `${noun} featured`)}><Star size={15} aria-hidden />Feature</button>
    <button type="button" disabled={busy} onClick={() => void run({ is_featured: false }, `${noun} no longer featured`)}><StarOff size={15} aria-hidden />Unfeature</button>
    <button type="button" className="danger" disabled={busy} onClick={archive}><Archive size={15} aria-hidden />Archive</button>
    <button type="button" className="bulk-clear" onClick={() => set(ids, false)} aria-label="Clear selection"><X size={16} aria-hidden /></button>
    <dialog ref={confirm} className="user-dialog confirm-dialog" aria-label={`Archive ${noun}`}>
      <h2>Archive {noun}?</h2>
      <p>They disappear from the portal. Where an archived document was current, the previous revision becomes current. You can undo right after.</p>
      <div className="user-actions confirm-actions"><button type="button" className="button secondary" onClick={() => confirm.current?.close()}>Cancel</button>
        <button type="button" className="button danger" disabled={busy} onClick={() => void run({ archived: true }, `${noun} archived`)}>Archive {noun}</button></div>
    </dialog>
  </div>;
}

/** "⋯" per row: the less frequent actions, out of the way of the main ones. */
export function RowMenu({ id, children }: { id: string; children: ReactNode }) {
  const menuId = `row-menu-${id}`;
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = panel.current;
    if (!element) return;
    // Native popovers open in the top layer: place it under its button, inside the viewport.
    const place = (event: Event) => {
      if ((event as ToggleEvent).newState !== "open" || !trigger.current) return;
      const box = trigger.current.getBoundingClientRect();
      const width = 220;
      element.style.left = `${Math.max(8, Math.min(window.innerWidth - width - 8, box.right - width))}px`;
      const below = box.bottom + 6;
      element.style.top = below + 200 > window.innerHeight ? "auto" : `${below}px`;
      element.style.bottom = below + 200 > window.innerHeight ? `${window.innerHeight - box.top + 6}px` : "auto";
    };
    element.addEventListener("beforetoggle", place);
    return () => element.removeEventListener("beforetoggle", place);
  }, []);
  return <span className="row-menu">
    <button ref={trigger} type="button" className="icon-button" popoverTarget={menuId} aria-label="More actions" title="More actions"><MoreHorizontal size={18} aria-hidden /></button>
    <div ref={panel} id={menuId} popover="auto" className="row-menu-panel">{children}</div>
  </span>;
}

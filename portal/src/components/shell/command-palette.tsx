"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, FolderOpen, History, Search, Zap } from "lucide-react";
import type { SearchResults } from "@/app/api/search/route";
import { OPEN_SEARCH } from "./search-trigger";

type Item = { key: string; group: "Documents" | "Projects" | "Actions"; href: string; title: string; meta?: string; badge?: string; superseded?: boolean };

function flatten(results: SearchResults): Item[] {
  return [
    ...results.documents.map((d) => ({ key: `d-${d.id}`, group: "Documents" as const, href: d.href,
      title: `${d.number} ${d.title}`, meta: `${d.project} · ${d.discipline} · Rev ${d.revision}`, badge: d.current ? d.status : "Superseded", superseded: !d.current })),
    ...results.projects.map((p) => ({ key: `p-${p.slug}`, group: "Projects" as const, href: p.href, title: p.name, meta: p.location ?? undefined })),
    ...results.actions.map((a, i) => ({ key: `a-${i}`, group: "Actions" as const, href: a.href, title: a.label, badge: a.hint })),
  ];
}

const isTyping = (target: EventTarget | null) => target instanceof HTMLElement &&
  (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

/**
 * ⌘K / Ctrl+K (or "/") from any signed-in page: documents by number or title, projects and admin actions.
 * An exact number comes first, so "AR-101" + Enter opens that drawing's current revision.
 */
export function CommandPalette() {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [history, setHistory] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [active, setActive] = useState(0);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const listId = useId();

  useEffect(() => {
    const open = () => { if (!dialog.current?.open) { dialog.current?.showModal(); input.current?.select(); } };
    const keys = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); open(); }
      else if (event.key === "/" && !isTyping(event.target) && !document.querySelector("dialog[open]")) { event.preventDefault(); open(); }
    };
    window.addEventListener("keydown", keys);
    window.addEventListener(OPEN_SEARCH, open);
    return () => { window.removeEventListener("keydown", keys); window.removeEventListener(OPEN_SEARCH, open); };
  }, []);

  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setState("loading");
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(text)}&history=${history ? 1 : 0}`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error();
        setItems(flatten(await response.json() as SearchResults)); setActive(0); setState("idle");
      } catch (error) { if ((error as Error).name !== "AbortError") setState("error"); }
    }, 150);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [query, history]);

  const shown = query.trim().length < 2 ? [] : items;
  const go = (item: Item | undefined) => { if (!item) return; dialog.current?.close(); router.push(item.href); };
  const groups = (["Documents", "Projects", "Actions"] as const).map((group) => ({ group, entries: shown.filter((i) => i.group === group) }));
  const optionId = (index: number) => `${listId}-option-${index}`;

  return <dialog ref={dialog} className="command-palette" aria-label="Search" onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }}
    onClose={() => { setQuery(""); setItems([]); }}>
    <div className="command-box">
      <div className="command-input"><Search size={20} aria-hidden />
        <input ref={input} type="search" value={query} placeholder="Search drawings by number or title, projects, actions…"
          aria-label="Search documents, projects and actions" role="combobox" aria-expanded={shown.length > 0} aria-controls={listId}
          aria-activedescendant={shown.length ? optionId(active) : undefined} autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") { event.preventDefault(); setActive((i) => Math.min(shown.length - 1, i + 1)); }
            else if (event.key === "ArrowUp") { event.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
            else if (event.key === "Enter") { event.preventDefault(); go(shown[active]); }
          }} />
        <kbd>Esc</kbd>
      </div>
      <div className="command-scope">
        <label><input type="checkbox" checked={history} onChange={(event) => setHistory(event.target.checked)} />Include superseded revisions</label>
        <span aria-live="polite">{state === "loading" ? "Searching…" : state === "error" ? "Search is unavailable. Try again." : ""}</span>
      </div>
      <div id={listId} role="listbox" aria-label="Results" className="command-results">
        {query.trim().length < 2 && <p className="command-hint">Type at least 2 characters. Try a drawing number like <strong>A-101</strong>.</p>}
        {query.trim().length >= 2 && state !== "loading" && !shown.length && <p className="command-hint">No results for “{query.trim()}”.</p>}
        {groups.filter((g) => g.entries.length).map(({ group, entries }) => <div key={group} role="group" aria-label={group}>
          <div className="command-group">{group}</div>
          {entries.map((item) => {
            const index = shown.indexOf(item);
            const Icon = item.group === "Documents" ? (item.superseded ? History : FileText) : item.group === "Projects" ? FolderOpen : Zap;
            return <div key={item.key} id={optionId(index)} role="option" aria-selected={index === active} className="command-option"
              onMouseEnter={() => setActive(index)} onClick={() => go(item)}>
              <span className="command-icon" aria-hidden><Icon size={16} /></span>
              <span className="command-text"><strong>{item.title}</strong>{item.meta && <span>{item.meta}</span>}</span>
              {item.badge && <span className={`command-badge${item.superseded ? " superseded" : ""}`}>{item.badge}</span>}
              {index === active && <kbd aria-hidden>↵</kbd>}
            </div>;
          })}
        </div>)}
      </div>
      <div className="command-footer"><span><kbd>↑</kbd><kbd>↓</kbd> Move</span><span><kbd>↵</kbd> Open</span>
        <span className="command-footer-end">Open anywhere with <kbd>⌘K</kbd> or <kbd>/</kbd></span></div>
    </div>
  </dialog>;
}

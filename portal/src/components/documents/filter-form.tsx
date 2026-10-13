"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";

/**
 * GET filter form that applies itself: selects and dates on change, text after a short pause.
 * On small screens the secondary filters collapse behind a "Filters" button.
 */
export function FilterForm({ search, children, activeCount, className = "" }: { search: ReactNode; children: ReactNode; activeCount: number; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const form = useRef<HTMLFormElement>(null);
  const timer = useRef(0);
  const [open, setOpen] = useState(false);
  const params = useSearchParams();
  // Uncontrolled fields keep stale text after a chip removes a filter; resync them from the URL,
  // except the field the person is typing in.
  useEffect(() => {
    for (const element of Array.from(form.current?.elements ?? [])) {
      const field = element as HTMLInputElement | HTMLSelectElement;
      if (!field.name || field.type === "hidden" || field === document.activeElement) continue;
      const value = params.get(field.name) ?? "";
      if (field.value !== value) field.value = value;
    }
  }, [params]);
  const apply = () => {
    if (!form.current) return;
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(form.current)) if (typeof value === "string" && value.trim()) params.set(key, value.trim());
    router.replace(`${pathname}?${params}`, { scroll: false });
  };
  return <form ref={form} className={`filters ${className}`} method="get" role="search"
    onSubmit={(event) => { event.preventDefault(); window.clearTimeout(timer.current); apply(); }}
    onChange={(event) => {
      const target = event.target as unknown as HTMLInputElement;
      window.clearTimeout(timer.current);
      if (target.type === "search" || target.type === "text") timer.current = window.setTimeout(apply, 400);
      else apply();
    }}>
    {search}
    <button className="filter-toggle" type="button" aria-expanded={open} aria-controls="filter-panel" onClick={() => setOpen(!open)}>
      <SlidersHorizontal size={16} aria-hidden />Filters{activeCount ? ` (${activeCount})` : ""}
    </button>
    <div id="filter-panel" className={`filter-panel${open ? " is-open" : ""}`}>{children}</div>
    <button type="submit" className="hidden-submit" tabIndex={-1}>Apply filters</button>
  </form>;
}

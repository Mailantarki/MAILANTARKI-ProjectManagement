"use client";
import { Search } from "lucide-react";

export const OPEN_SEARCH = "portal:open-search";
export const openSearch = () => window.dispatchEvent(new Event(OPEN_SEARCH));

/** Opens the command palette (⌘K). */
export function SearchTrigger({ compact = false }: { compact?: boolean }) {
  return compact
    ? <button type="button" className="icon-only" aria-label="Search" onClick={openSearch}><Search size={20} aria-hidden /></button>
    : <button type="button" className="sidebar-search" onClick={openSearch}>
      <Search size={16} aria-hidden /><span>Search</span><kbd>⌘K</kbd>
    </button>;
}

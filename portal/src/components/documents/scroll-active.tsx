"use client";
import { useEffect, useRef } from "react";

/** Keeps the active discipline tab visible when the tab row scrolls horizontally. */
export function ScrollActiveIntoView({ children, className, label }: { children: React.ReactNode; className: string; label: string }) {
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    const active = nav.current?.querySelector<HTMLElement>("[aria-current='page']");
    if (active && nav.current && nav.current.scrollWidth > nav.current.clientWidth) {
      nav.current.scrollLeft = active.offsetLeft - (nav.current.clientWidth - active.offsetWidth) / 2;
    }
  });
  return <nav ref={nav} className={className} aria-label={label}>{children}</nav>;
}

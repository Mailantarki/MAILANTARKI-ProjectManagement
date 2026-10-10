"use client";
import { useEffect, useState } from "react";

const EVENT = "portal:toast";
type ToastAction = { label: string; onClick: () => void };
type Detail = { message: string; action?: ToastAction; error?: boolean };

/**
 * Shows a short message ("Changes saved") from any client component. An action ("Undo") keeps it up
 * for 10 s; errors stay until dismissed.
 */
export function toast(message: string, options: { action?: ToastAction; error?: boolean } = {}) {
  window.dispatchEvent(new CustomEvent<Detail>(EVENT, { detail: { message, ...options } }));
}

export function Toaster() {
  const [current, setCurrent] = useState<Detail | null>(null);
  useEffect(() => {
    let timer = 0;
    const show = (event: Event) => {
      const detail = (event as CustomEvent<Detail | string>).detail;
      const next = typeof detail === "string" ? { message: detail } : detail;
      setCurrent(next);
      window.clearTimeout(timer);
      if (!next.error) timer = window.setTimeout(() => setCurrent(null), next.action ? 10000 : 3000);
    };
    window.addEventListener(EVENT, show);
    return () => { window.removeEventListener(EVENT, show); window.clearTimeout(timer); };
  }, []);
  return <div className="toast-region" aria-live={current?.error ? "assertive" : "polite"}>
    {current && <div className={`toast${current.error ? " toast-error" : ""}`} role={current.error ? "alert" : undefined}>
      <span>{current.message}</span>
      {current.action && <button type="button" className="toast-action" onClick={() => { current.action!.onClick(); setCurrent(null); }}>{current.action.label}</button>}
      {current.error && <button type="button" className="toast-action" onClick={() => setCurrent(null)}>Dismiss</button>}
    </div>}
  </div>;
}

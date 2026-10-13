"use client";
import { useState } from "react";
import { Check, Link2 } from "lucide-react";

/** Copies an absolute link to `path` (never a signed file URL). */
export function CopyLinkButton({ path, label = "Copy link", compact = false, className = "" }: {
  path: string; label?: string; /** Icon only (the label stays as the accessible name). */ compact?: boolean; className?: string;
}) {
  const [copied, setCopied] = useState(false);
  return <button type="button" className={`button secondary icon-button-text ${className}`.trim()} aria-label={label} title={label} onClick={async () => {
    try { await navigator.clipboard.writeText(new URL(path, window.location.origin).toString()); setCopied(true); window.setTimeout(() => setCopied(false), 2000); }
    catch { /* clipboard unavailable: nothing to do */ }
  }}>{copied ? <Check size={16} aria-hidden /> : <Link2 size={16} aria-hidden />}{!compact && <span>{copied ? "Copied" : "Copy link"}</span>}</button>;
}

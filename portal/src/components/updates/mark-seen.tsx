"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck } from "lucide-react";

/** "Mark all as seen" (Home) or "Mark as seen" (one project). */
export function MarkSeenButton({ projectId, label = "Mark all as seen", className = "button secondary" }: {
  projectId?: string; label?: string; className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return <button type="button" className={className} disabled={busy} onClick={async () => {
    setBusy(true);
    try {
      await fetch("/api/visits", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(projectId ? { projectIds: [projectId], markSeen: true } : { all: true, markSeen: true }) });
      router.refresh();
    } finally { setBusy(false); }
  }}><CheckCheck size={16} aria-hidden />{label}</button>;
}

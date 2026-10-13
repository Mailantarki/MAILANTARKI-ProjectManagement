"use client";
import { useEffect } from "react";

/** Records the visit after the page has rendered with the previous "since". */
export function VisitBeacon({ projectId }: { projectId: string }) {
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/visits", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectIds: [projectId] }), signal: controller.signal, keepalive: true }).catch(() => undefined);
    return () => controller.abort();
  }, [projectId]);
  return null;
}

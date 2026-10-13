"use client";

import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/ui/status-badge";

export function CodeStatus({ active, expiresAt }: { active: boolean; expiresAt: string | null }) {
  const [expired, setExpired] = useState<boolean | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setExpired(Boolean(expiresAt && Date.parse(expiresAt) <= Date.now())), 0);
    return () => clearTimeout(timer);
  }, [expiresAt]);
  return !active ? <StatusBadge status="revoked" /> : expired === null ? <>...</> :
    <StatusBadge status={expired ? "expired" : "active"} />;
}

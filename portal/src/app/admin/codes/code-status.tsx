"use client";

import { useEffect, useState } from "react";

export function CodeStatus({ active, expiresAt }: { active: boolean; expiresAt: string | null }) {
  const [expired, setExpired] = useState<boolean | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setExpired(Boolean(expiresAt && Date.parse(expiresAt) <= Date.now())), 0);
    return () => clearTimeout(timer);
  }, [expiresAt]);
  return <>{!active ? "Revoked" : expired === null ? "..." : expired ? "Expired" : "Active"}</>;
}

import { copy } from "@/lib/copy";

export function TopbarSkeleton() {
  return <header className="topbar unified-nav"><span className="brand">{copy.brand}</span></header>;
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <span className={`skeleton ${className}`} aria-hidden />;
}

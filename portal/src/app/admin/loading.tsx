import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return <main className="main portal" aria-busy="true"><span className="sr-only" role="status">Loading</span>
    <Skeleton className="skeleton-label" /><Skeleton className="skeleton-title" />
    <div className="skeleton-rows">{[0, 1, 2, 3, 4].map((i) => <Skeleton className="skeleton-row" key={i} />)}</div>
  </main>;
}

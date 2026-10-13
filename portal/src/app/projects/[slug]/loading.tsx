import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return <main aria-busy="true" className="portal project-detail"><span className="sr-only" role="status">Loading documents</span>
      <section className="project-hero"><div className="project-heading"><Skeleton className="skeleton-title" /><Skeleton className="skeleton-line" /></div></section>
      <div className="skeleton-tabs">{[0, 1, 2, 3, 4].map((i) => <Skeleton className="skeleton-tab" key={i} />)}</div>
      <Skeleton className="skeleton-search" />
      <div className="skeleton-rows">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton className="skeleton-row" key={i} />)}</div>
    </main>;
}

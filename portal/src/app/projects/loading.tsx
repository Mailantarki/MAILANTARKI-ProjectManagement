import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return <main aria-busy="true" className="portal projects-index"><span className="sr-only" role="status">Loading projects</span>
      <Skeleton className="skeleton-label" /><Skeleton className="skeleton-title" />
      <div className="project-grid">{[0, 1, 2, 3, 4, 5].map((i) => <div className="ui-card project-card skeleton-card" key={i}>
        <Skeleton className="skeleton-cover" /><div className="skeleton-card-body"><Skeleton className="skeleton-line wide" /><Skeleton className="skeleton-line" /></div>
      </div>)}</div>
    </main>;
}

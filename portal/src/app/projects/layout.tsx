import { getIdentity, getPrincipal } from "@/lib/auth/principal";
import { getViewer } from "@/lib/auth/viewer";
import { preload, visibleProjects } from "@/lib/documents/list";
import { AppShell } from "@/components/shell/app-shell";
import { updatesFeed } from "@/lib/updates/feed";

export const dynamic = "force-dynamic";

export default async function ProjectsLayout({ children }: { children: React.ReactNode }) {
  // Same request-scoped data as the pages (cached), so the sidebar adds no sequential round-trip.
  const preloaded = preload(await getIdentity());
  const principal = await getPrincipal();
  if (!principal) return children; // the page redirects to sign-in
  const [projects, viewer, feed] = await Promise.all([
    visibleProjects(principal, preloaded), getViewer(principal),
    updatesFeed(principal).catch(() => ({ feeds: [], total: 0 })), // dots are optional
  ]);
  const updates = new Map(feed.feeds.map((f) => [f.projectId, f.updates.length]));
  return <AppShell mode="portal" viewer={viewer} homeBadge={feed.total}
    projects={projects.map((p) => ({ slug: p.slug, name: p.name, updates: updates.get(p.id) ?? 0 }))}>
    {children}
  </AppShell>;
}

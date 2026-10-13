import type { Viewer } from "@/lib/auth/viewer";
import { AdminSidebar, PortalSidebar, type ShellProject } from "./sidebar";
import { AdminMobileNav, PortalMobileNav } from "./mobile-nav";
import { CommandPalette } from "./command-palette";

/**
 * The frame of every signed-in page: a sidebar on large screens, a top bar and bottom tabs on phones,
 * and the page in a white panel. Admin pages use their own sidebar.
 */
export function AppShell({ mode, viewer, projects, homeBadge = 0, children, extra }: {
  mode: "portal" | "admin"; viewer: Viewer; projects: ShellProject[]; homeBadge?: number;
  children: React.ReactNode; extra?: React.ReactNode;
}) {
  return <div className={`app-shell app-shell-${mode}`}>
    <a className="skip-link" href="#content">Skip to content</a>
    {mode === "portal" ? <PortalSidebar viewer={viewer} projects={projects} homeBadge={homeBadge} />
      : <AdminSidebar viewer={viewer} projects={projects} />}
    {mode === "portal" ? <PortalMobileNav viewer={viewer} projects={projects} homeBadge={homeBadge} /> : <AdminMobileNav viewer={viewer} />}
    <div className="app-main" id="content">{children}</div>
    <CommandPalette />
    {extra}
  </div>;
}

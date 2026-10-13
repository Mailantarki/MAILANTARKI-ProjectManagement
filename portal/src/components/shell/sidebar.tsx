"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, FolderOpen, History, Home, LayoutDashboard, Settings, Building2, Users } from "lucide-react";
import type { Viewer } from "@/lib/auth/viewer";
import { ProjectAvatar } from "./project-avatar";
import { SearchTrigger } from "./search-trigger";
import { UserMenu } from "./user-menu";

export type ShellProject = { slug: string; name: string; updates?: number };

const isActive = (pathname: string, href: string, exact = false) =>
  exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

export function PortalSidebar({ viewer, projects, homeBadge = 0 }: { viewer: Viewer; projects: ShellProject[]; homeBadge?: number }) {
  const pathname = usePathname();
  return <nav className="app-sidebar" aria-label="Main">
    <Link className="sidebar-brand" href="/projects"><span aria-hidden>M</span>MAILANTARKI</Link>
    <SearchTrigger />
    <div className="sidebar-group">
      <Link className="sidebar-link" href="/projects" aria-current={pathname === "/projects" ? "page" : undefined}>
        <Home size={16} aria-hidden /><span>Home</span>{homeBadge > 0 && <span className="sidebar-badge" aria-label={`${homeBadge} updates`}>{homeBadge}</span>}
      </Link>
    </div>
    <div className="sidebar-group">
      <div className="sidebar-heading">Projects</div>
      {projects.map((project) => {
        const href = `/projects/${project.slug}`;
        return <Link key={project.slug} className="sidebar-link" href={href} aria-current={isActive(pathname, href) ? "page" : undefined}>
          <ProjectAvatar name={project.name} /><span>{project.name}</span>
          {!!project.updates && <span className="sidebar-dot" aria-label={`${project.updates} new`} />}
        </Link>;
      })}
      {!projects.length && <p className="sidebar-empty">No projects yet.</p>}
    </div>
    {viewer.isAdmin && <div className="sidebar-group">
      <Link className="sidebar-link" href="/admin"><Settings size={16} aria-hidden /><span>Admin console</span></Link>
    </div>}
    <div className="sidebar-spacer" />
    <UserMenu viewer={viewer} />
  </nav>;
}

const adminSections = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/projects", label: "Projects & documents", icon: FolderOpen },
  { href: "/admin/users", label: "People & access", icon: Users, also: ["/admin/codes"] },
  { href: "/admin/organizations", label: "Organizations", icon: Building2 },
  { href: "/admin/logs", label: "Activity log", icon: History },
];

export function adminSectionActive(pathname: string, section: (typeof adminSections)[number]) {
  return isActive(pathname, section.href, section.exact) || (section.also ?? []).some((href) => isActive(pathname, href));
}

export function AdminSidebar({ viewer, projects }: { viewer: Viewer; projects: ShellProject[] }) {
  const pathname = usePathname();
  return <nav className="app-sidebar" aria-label="Administration">
    <Link className="sidebar-brand" href="/admin"><span aria-hidden>M</span>MAILANTARKI</Link>
    <Link className="sidebar-back" href="/projects"><ArrowLeft size={16} aria-hidden />Back to portal</Link>
    <div className="sidebar-group">
      {adminSections.map((section) => {
        const Icon = section.icon;
        return <div key={section.href}>
          <Link className="sidebar-link" href={section.href} aria-current={adminSectionActive(pathname, section) ? "page" : undefined}>
            <Icon size={16} aria-hidden /><span>{section.label}</span>
          </Link>
          {section.href === "/admin/projects" && pathname.startsWith("/admin/projects") && <div className="sidebar-nested">
            {projects.map((project) => {
              const href = `/admin/projects/${project.slug}/documents`;
              return <Link key={project.slug} className="sidebar-link" href={href} aria-current={isActive(pathname, href) ? "page" : undefined}>
                <ProjectAvatar name={project.name} /><span>{project.name}</span></Link>;
            })}
          </div>}
        </div>;
      })}
    </div>
    <div className="sidebar-spacer" />
    <UserMenu viewer={viewer} id="admin-user-menu" />
  </nav>;
}

export { adminSections };

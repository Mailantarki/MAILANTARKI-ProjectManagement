"use client";
import Link from "next/link";
import { useRef } from "react";
import { usePathname } from "next/navigation";
import { FolderOpen, Home, KeyRound, LogOut, Search, UserRound, X } from "lucide-react";
import { signOut } from "@/app/projects/sign-out";
import type { Viewer } from "@/lib/auth/viewer";
import { ProjectAvatar } from "./project-avatar";
import { openSearch, SearchTrigger } from "./search-trigger";
import { adminSectionActive, adminSections, type ShellProject } from "./sidebar";

function Sheet({ dialog, title, children }: { dialog: React.RefObject<HTMLDialogElement | null>; title: string; children: React.ReactNode }) {
  return <dialog ref={dialog} className="sheet" aria-label={title} onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
    <div className="sheet-body">
      <header><h2>{title}</h2><button type="button" className="icon-only" aria-label="Close" onClick={() => dialog.current?.close()}><X size={20} aria-hidden /></button></header>
      {children}
    </div>
  </dialog>;
}

function AccountSheet({ viewer, dialog }: { viewer: Viewer; dialog: React.RefObject<HTMLDialogElement | null> }) {
  return <Sheet dialog={dialog} title="Account">
    <div className="sheet-account"><span className="user-avatar" aria-hidden>{viewer.initials}</span><div><strong>{viewer.name}</strong><span>{viewer.detail}</span></div></div>
    <div className="sheet-links">
      {viewer.isAdmin && <Link href="/admin" onClick={() => dialog.current?.close()}>Admin console</Link>}
      {viewer.kind === "user" && <Link href="/change-password" onClick={() => dialog.current?.close()}><KeyRound size={18} aria-hidden />Change password</Link>}
      <form action={signOut}><button type="submit"><LogOut size={18} aria-hidden />{viewer.kind === "visitor" ? "Leave" : "Sign out"}</button></form>
    </div>
  </Sheet>;
}

/** Phones: a slim top bar and a bottom tab bar (Home, Projects, Search, Account). */
export function PortalMobileNav({ viewer, projects, homeBadge = 0 }: { viewer: Viewer; projects: ShellProject[]; homeBadge?: number }) {
  const pathname = usePathname();
  const projectsSheet = useRef<HTMLDialogElement>(null);
  const accountSheet = useRef<HTMLDialogElement>(null);
  const inProject = pathname.startsWith("/projects/");
  return <>
    <header className="mobile-topbar"><Link className="sidebar-brand" href="/projects"><span aria-hidden>M</span>MAILANTARKI</Link><SearchTrigger compact /></header>
    <nav className="bottom-tabs" aria-label="Main">
      <Link href="/projects" aria-current={pathname === "/projects" ? "page" : undefined}>
        <Home size={22} aria-hidden /><span>Home</span>{homeBadge > 0 && <i className="tab-badge">{homeBadge}</i>}</Link>
      <button type="button" aria-current={inProject ? "page" : undefined} onClick={() => projectsSheet.current?.showModal()}>
        <FolderOpen size={22} aria-hidden /><span>Projects</span></button>
      <button type="button" onClick={openSearch}><Search size={22} aria-hidden /><span>Search</span></button>
      <button type="button" onClick={() => accountSheet.current?.showModal()}><UserRound size={22} aria-hidden /><span>Account</span></button>
    </nav>
    <Sheet dialog={projectsSheet} title="Projects">
      <div className="sheet-links">{projects.map((project) => <Link key={project.slug} href={`/projects/${project.slug}`}
        aria-current={pathname.startsWith(`/projects/${project.slug}`) ? "page" : undefined} onClick={() => projectsSheet.current?.close()}>
        <ProjectAvatar name={project.name} /><span>{project.name}</span>{!!project.updates && <span className="sidebar-dot" aria-label={`${project.updates} new`} />}</Link>)}
      </div>
    </Sheet>
    <AccountSheet viewer={viewer} dialog={accountSheet} />
  </>;
}

export function AdminMobileNav({ viewer }: { viewer: Viewer }) {
  const pathname = usePathname();
  const accountSheet = useRef<HTMLDialogElement>(null);
  return <>
    <header className="mobile-topbar"><Link className="sidebar-brand" href="/admin"><span aria-hidden>M</span>ADMIN</Link>
      <span className="mobile-topbar-actions"><Link className="mobile-topbar-link" href="/projects">Portal</Link>
        <button type="button" className="icon-only" aria-label="Account" onClick={() => accountSheet.current?.showModal()}><UserRound size={20} aria-hidden /></button></span></header>
    <nav className="mobile-sections" aria-label="Administration sections">
      {adminSections.map((section) => <Link key={section.href} href={section.href}
        aria-current={adminSectionActive(pathname, section) ? "page" : undefined}>{section.label}</Link>)}
    </nav>
    <AccountSheet viewer={viewer} dialog={accountSheet} />
  </>;
}

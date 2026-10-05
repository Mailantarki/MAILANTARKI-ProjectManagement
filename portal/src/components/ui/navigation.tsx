"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Settings } from "lucide-react";
import { signOut } from "@/app/projects/sign-out";
import { copy } from "@/lib/copy";

const sections = [["Overview", "/admin"], ["Organizations", "/admin/organizations"],
  ["Projects", "/admin/projects"], ["Users", "/admin/users"], ["Codes", "/admin/codes"], ["Logs", "/admin/logs"]];

export function Navigation({ admin }: { admin: boolean }) {
  const pathname = usePathname();
  const inAdmin = pathname === "/admin" || pathname.startsWith("/admin/");
  return <header className="topbar unified-nav">
    <Link className="brand" href="/projects">{copy.brand}</Link>
    {admin && inAdmin && <nav className="admin-nav" aria-label="Administration sections">
      {sections.map(([label, href]) => {
        const active = href === "/admin" ? pathname === href : pathname.startsWith(href);
        return <Link key={href} href={href} aria-current={active ? "page" : undefined}>{label}</Link>;
      })}
    </nav>}
    <div className="topbar-links">
      {admin && <Link className="topbar-action" href={inAdmin ? "/projects" : "/admin"}>
        {!inAdmin && <Settings size={15} aria-hidden />}{inAdmin ? "Portal" : "Admin"}</Link>}
      <form action={signOut}><button className="topbar-action" type="submit"><LogOut size={15} aria-hidden />{copy.signOut}</button></form>
    </div>
  </header>;
}

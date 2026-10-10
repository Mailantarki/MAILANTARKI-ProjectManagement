"use client";
import Link from "next/link";
import { ChevronsUpDown, KeyRound, LogOut } from "lucide-react";
import { signOut } from "@/app/projects/sign-out";
import type { Viewer } from "@/lib/auth/viewer";

/** Name, role and account actions. A native popover: Esc and outside clicks close it. */
export function UserMenu({ viewer, id = "user-menu" }: { viewer: Viewer; id?: string }) {
  return <div className="user-menu">
    <button type="button" className="user-menu-trigger" popoverTarget={id} aria-haspopup="menu">
      <span className="user-avatar" aria-hidden>{viewer.initials}</span>
      <span className="user-menu-text"><strong>{viewer.name}</strong><span>{viewer.detail}</span></span>
      <ChevronsUpDown size={16} aria-hidden />
    </button>
    <div id={id} popover="auto" className="user-menu-panel" role="menu">
      {viewer.kind === "user" && <Link role="menuitem" href="/change-password"><KeyRound size={16} aria-hidden />Change password</Link>}
      <form action={signOut}><button role="menuitem" type="submit"><LogOut size={16} aria-hidden />{viewer.kind === "visitor" ? "Leave" : "Sign out"}</button></form>
    </div>
  </div>;
}

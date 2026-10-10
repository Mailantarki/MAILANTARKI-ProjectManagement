import { redirect } from "next/navigation";
import { getPrincipal } from "@/lib/auth/principal";
import { isAdminPrincipal } from "@/lib/auth/authorize";
import { getViewer } from "@/lib/auth/viewer";
import { getUserClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/shell/app-shell";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getUserClient();
  // Projects for the sidebar load under RLS while the session is verified.
  const [principal, { data: projects }] = await Promise.all([
    getPrincipal(),
    user.from("projects").select("slug,name").is("archived_at", null).order("name"),
  ]);
  if (!principal || !isAdminPrincipal(principal)) redirect("/login");
  const viewer = await getViewer(principal);
  return <AppShell mode="admin" viewer={viewer} projects={projects ?? []}>{children}</AppShell>;
}

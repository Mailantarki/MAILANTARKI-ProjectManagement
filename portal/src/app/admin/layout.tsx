import Link from "next/link";
import { redirect } from "next/navigation";
import { getPrincipal } from "@/lib/auth/principal";
import { isAdminPrincipal } from "@/lib/auth/authorize";
import { copy } from "@/lib/copy";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const principal = await getPrincipal();
  if (!isAdminPrincipal(principal)) redirect("/login");
  return <div className="shell"><header className="topbar"><Link className="brand" href="/admin">{copy.brand}</Link>
    <nav className="admin-nav"><Link href="/admin">Overview</Link><Link href="/projects">Portal</Link></nav></header>{children}</div>;
}

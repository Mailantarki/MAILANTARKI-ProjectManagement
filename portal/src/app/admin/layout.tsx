import { Navigation } from "@/components/ui/navigation";
import { redirect } from "next/navigation";
import { getPrincipal } from "@/lib/auth/principal";
import { isAdminPrincipal } from "@/lib/auth/authorize";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const principal = await getPrincipal();
  if (!isAdminPrincipal(principal)) redirect("/login");
  return <div className="shell admin-shell"><Navigation admin={isAdminPrincipal(principal)} />{children}</div>;
}

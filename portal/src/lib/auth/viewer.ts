import "server-only";
import { cache } from "react";
import type { Principal } from "./principal";
import { getAdminClient } from "../supabase/admin";
import { getUserClient } from "../supabase/server";

export type Viewer = {
  kind: "user" | "visitor";
  name: string;
  detail: string;
  initials: string;
  isAdmin: boolean;
};

const roleLabels = { super_admin: "Super admin", org_admin: "Organization admin", member: "Member" } as const;

export const initials = (text: string) =>
  text.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]!.toUpperCase()).join("") || "?";

/** Name and role for the user menu. Display only: access is always decided by authorize(). */
export const getViewer = cache(async (principal: Principal): Promise<Viewer> => {
  if (principal.kind === "visitor") {
    const { data } = await getAdminClient().from("access_codes").select("label").eq("id", principal.accessCodeId).maybeSingle();
    const name = data?.label ?? "Project code";
    return { kind: "visitor", name, detail: "Guest with a code", initials: initials(name), isAdmin: false };
  }
  const client = await getUserClient();
  const [{ data: profile }, { data: { session } }] = await Promise.all([
    client.from("profiles").select("full_name").eq("id", principal.userId).maybeSingle(),
    client.auth.getSession(),
  ]);
  const name = profile?.full_name || session?.user.email || "Account";
  return { kind: "user", name, detail: roleLabels[principal.role], initials: initials(name),
    isAdmin: principal.role !== "member" };
});

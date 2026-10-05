import "server-only";
import { cookies } from "next/headers";
import { getAdminClient } from "../supabase/admin";
import { getUserClient } from "../supabase/server";
import { readVisitorSession } from "../access-codes/session";

export type Principal =
  | { kind: "user"; userId: string; role: "super_admin" | "org_admin" | "member"; organizationId: string | null }
  | { kind: "visitor"; accessCodeId: string };

export async function getPrincipal(): Promise<Principal | null> {
  const client = await getUserClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (!error && user) {
    const { data: profile } = await client.from("profiles")
      .select("role,organization_id,suspended_at,must_change_password").eq("id", user.id).maybeSingle();
    if (!profile || profile.suspended_at || profile.must_change_password || user.deleted_at ||
      (user.banned_until && Date.parse(user.banned_until) > Date.now())) return null;
    return { kind: "user", userId: user.id, role: profile.role, organizationId: profile.organization_id };
  }
  const token = (await cookies()).get("visitor_session")?.value;
  if (!token) return null;
  const accessCodeId = await readVisitorSession(token);
  if (!accessCodeId) return null;
  const { data: code } = await getAdminClient().from("access_codes")
    .select("id,is_active,expires_at").eq("id", accessCodeId).maybeSingle();
  if (!code?.is_active || (code.expires_at && new Date(code.expires_at).getTime() <= Date.now())) {
    try { (await cookies()).delete("visitor_session"); } catch { /* Read-only render; rejected on this request. */ }
    return null;
  }
  return { kind: "visitor", accessCodeId };
}

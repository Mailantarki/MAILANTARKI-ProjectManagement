import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { getAdminClient } from "../supabase/admin";
import { getUserClient } from "../supabase/server";
import { readVisitorSession } from "../access-codes/session";
import { timed } from "../perf";

export type Principal =
  | { kind: "user"; userId: string; role: "super_admin" | "org_admin" | "member"; organizationId: string | null }
  | { kind: "visitor"; accessCodeId: string };

// Resolved once per request: layouts, pages and route handlers share the same result.
export const getPrincipal = cache(() => timed("getPrincipal", resolvePrincipal));

async function resolvePrincipal(): Promise<Principal | null> {
  const client = await getUserClient();
  // Read the (unverified) user id from the session cookie so the token check and the profile
  // lookup can run in parallel. The id is trusted only if getClaims() verifies the same subject:
  // locally with asymmetric signing keys, or through Auth (getUser) with legacy HS256 keys.
  // Suspension and deletion are enforced through the profile row.
  const { data: { session } } = await client.auth.getSession();
  const candidate = session ? tokenSubject(session.access_token) : null;
  if (candidate) {
    const [{ data, error }, { data: profile }] = await Promise.all([
      client.auth.getClaims(),
      client.from("profiles").select("role,organization_id,suspended_at,must_change_password").eq("id", candidate).maybeSingle(),
    ]);
    if (!error && data?.claims?.sub === candidate) {
      if (!profile || profile.suspended_at || profile.must_change_password) return null;
      return { kind: "user", userId: candidate, role: profile.role, organizationId: profile.organization_id };
    }
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

/**
 * Who the cookies claim the viewer is, without any network call: the Supabase session subject
 * (unverified) or the visitor session (signature checked locally). Used only to start loading data
 * in parallel; access is always decided with the verified result of getPrincipal().
 */
export const getIdentity = cache(async (): Promise<{ kind: "user"; userId: string } | { kind: "visitor"; accessCodeId: string } | null> => {
  const { data: { session } } = await (await getUserClient()).auth.getSession();
  const userId = session ? tokenSubject(session.access_token) : null;
  if (userId) return { kind: "user", userId };
  const token = (await cookies()).get("visitor_session")?.value;
  const accessCodeId = token ? await readVisitorSession(token) : null;
  return accessCodeId ? { kind: "visitor", accessCodeId } : null;
});

function tokenSubject(token: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as { sub?: unknown };
    return typeof payload.sub === "string" && /^[\w-]{1,64}$/.test(payload.sub) ? payload.sub : null;
  } catch { return null; }
}

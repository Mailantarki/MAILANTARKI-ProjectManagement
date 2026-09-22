import "server-only";
import { getAdminClient } from "../supabase/admin";
import { requestIp } from "./rate-limit";

export async function logAccess(request: Request, entry: {
  action: "login" | "code_redeem" | "view" | "download";
  organization_id?: string | null;
  user_id?: string | null;
  access_code_id?: string | null;
  project_id?: string | null;
  document_id?: string | null;
}) {
  const { error } = await getAdminClient().from("access_logs").insert({
    ...entry, ip: requestIp(request), user_agent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
  });
  if (error) throw error;
}

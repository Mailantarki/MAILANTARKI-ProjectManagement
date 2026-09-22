import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getServerEnv } from "../env";

export function getAdminClient() {
  const env = getServerEnv();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

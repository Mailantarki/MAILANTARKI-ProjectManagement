import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getServerEnv } from "../env";
import { perfGlobal } from "../perf";

// Stateless service-role client (no session), safe to reuse across requests.
let client: SupabaseClient | undefined;

export function getAdminClient() {
  if (client) return client;
  const env = getServerEnv();
  client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: perfGlobal("admin"),
  });
  return client;
}

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase URL and service role key are required");
const client = createClient(url, key, { auth: { persistSession: false } });
const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
const { count, error } = await client.from("auth_attempts")
  .delete({ count: "exact" }).lt("created_at", cutoff);
if (error) throw new Error("Could not purge old auth attempts");
console.log(`Removed ${count ?? 0} expired auth attempt(s).`);

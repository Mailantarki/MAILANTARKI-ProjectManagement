import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getPublicEnv } from "../env";

export async function getUserClient() {
  const env = getPublicEnv();
  const jar = await cookies();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (items) => {
        try { for (const item of items) jar.set(item.name, item.value, item.options); }
        catch { /* Server Components are read-only; proxy refreshes cookies. */ }
      },
    },
  });
}

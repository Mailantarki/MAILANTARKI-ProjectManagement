import "server-only";
import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getPublicEnv } from "../env";
import { perfGlobal } from "../perf";

// One cookie-bound client per request (React cache is request-scoped in Server Components).
export const getUserClient = cache(async () => {
  const env = getPublicEnv();
  const jar = await cookies();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: perfGlobal("user"),
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (items) => {
        try { for (const item of items) jar.set(item.name, item.value, item.options); }
        catch { /* Server Components are read-only; proxy refreshes cookies. */ }
      },
    },
  });
});

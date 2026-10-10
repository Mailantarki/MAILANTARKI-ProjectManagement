// Opt-in request timing. Enable with PERF_LOG=1 to log every Supabase round-trip and timed block.
const enabled = () => process.env.PERF_LOG === "1";

export function perfGlobal(label: string): { fetch: typeof fetch } | undefined {
  if (!enabled()) return undefined;
  return {
    fetch: async (input, init) => {
      const start = performance.now();
      try {
        return await fetch(input, init);
      } finally {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        console.info(`[perf] ${label} ${init?.method ?? "GET"} ${new URL(url).pathname} ${Math.round(performance.now() - start)}ms`);
      }
    },
  };
}

export async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  if (!enabled()) return fn();
  const start = performance.now();
  try {
    return await fn();
  } finally {
    console.info(`[perf] ${label} ${Math.round(performance.now() - start)}ms`);
  }
}

import { z } from "zod";

// Return links are restricted to this project's local navigation flow.
export function projectReturn(value: unknown, slug: string, fallback: string): string {
  const parsed = z.string().max(4000).safeParse(value);
  if (!parsed.success) return fallback;
  const portal = `/projects/${encodeURIComponent(slug)}`;
  const documents = `/admin/projects/${encodeURIComponent(slug)}/documents`;
  const raw = parsed.data;
  if (raw === "/admin/projects" || raw === portal || raw.startsWith(`${portal}?`)) return raw;
  if (raw === documents) return raw;
  if (raw.startsWith(`${documents}?`)) {
    const inner = new URLSearchParams(raw.slice(documents.length + 1)).get("returnTo");
    const back = inner && (inner === portal || inner.startsWith(`${portal}?`)) ? inner : "/admin/projects";
    return withReturnTo(documents, back);
  }
  return fallback;
}

export function withReturnTo(destination: string, returnTo: string) {
  return `${destination}?${new URLSearchParams({ returnTo })}`;
}

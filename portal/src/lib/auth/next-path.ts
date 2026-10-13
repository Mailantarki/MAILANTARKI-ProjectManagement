/**
 * Where to go after signing in. Only project paths of this site are accepted,
 * so a crafted `?next=` cannot send the user to another domain (open redirect).
 */
export function safeNext(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return /^\/projects(\/[a-z0-9-]{1,100}(\/documents\/[A-Za-z0-9._~%-]{1,180})?)?$/.test(value) ? value : null;
}

/** Appends `?next=` to an internal URL when there is a valid destination. */
export function withNext(href: string, next: string | null): string {
  return next ? `${href}?next=${encodeURIComponent(next)}` : href;
}

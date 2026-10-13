/**
 * Revision order, identical to `public.revision_sort_key` in the database
 * (migration 20261010000100_current_revisions). Letters and numbers are separate tokens:
 *   0 < 1 < 2 < 10 < A < B < Z < AA,  P01 < P02,  C < C1.
 * Case, spaces and a leading "Rev" are ignored. The upload review uses it to tell the admin
 * what the database will do; the database decides again when the file is published.
 */
export function revisionSortKey(revision: string | null | undefined): string {
  const text = (revision ?? "").toUpperCase().replace(/^\s*REV(ISION)?\b[\s._-]*/, "");
  const tokens = text.match(/[0-9]+|[A-Z]+/g) ?? [];
  return tokens.map((token) => {
    if (/^[0-9]+$/.test(token)) {
      const digits = token.replace(/^0+/, "") || "0";
      return "1" + digits.padStart(Math.max(12, digits.length), "0");
    }
    return "2" + String(token.length).padStart(3, "0") + token;
  }).join(".");
}

/** Negative when a is an earlier revision than b. Byte order, like `collate "C"` in Postgres. */
export function compareRevisions(a: string, b: string): number {
  const ka = revisionSortKey(a), kb = revisionSortKey(b);
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}

/** Suggests the revision after `revision`: B → C, Z → AA, P02 → P03, 3 → 4. */
export function nextRevision(revision: string): string {
  const text = revision.trim().toUpperCase();
  const numeric = text.match(/^(.*?)(\d+)$/);
  if (numeric) return numeric[1] + String(Number(numeric[2]) + 1).padStart(numeric[2].length, "0");
  const letters = text.match(/^(.*?)([A-Z]+)$/);
  if (!letters) return text ? `${text}1` : "A";
  const chars = letters[2].split("");
  let i = chars.length - 1;
  while (i >= 0 && chars[i] === "Z") { chars[i] = "A"; i--; }
  if (i < 0) chars.unshift("A"); else chars[i] = String.fromCharCode(chars[i].charCodeAt(0) + 1);
  return letters[1] + chars.join("");
}

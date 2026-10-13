/**
 * Reads document metadata from a typical drawing file name:
 *   "A-101 Ground floor plan Rev B.pdf"      → A-101 · Ground floor plan · B
 *   "A101_Ground_Floor_Plan_rev_C.pdf"       → A101  · Ground Floor Plan · C
 *   "S-201.1 - Foundation details (B).pdf"   → S-201.1 · Foundation details · B
 *   "ARQ-PL-001 Planta baja.pdf"             → ARQ-PL-001 · Planta baja · 0
 * Names without a recognisable sheet number keep the previous behaviour: the whole name
 * becomes the title and an upper-case slug of it the number.
 */
export type ParsedName = { docNumber: string; title: string; revision: string; /** false when the number is only a guess. */ numberFound: boolean };

const NUMBER = /^([A-Z]{1,4}(?:[-_.][A-Z]{1,4})*[-_.]?\d{1,5}(?:[-.]\d{1,3})?[A-Z]?)(?=$|[\s\-_])/i;
const REVISION = [
  /[\s\-_.]+(?:rev(?:ision)?|r)[\s\-_.]*([A-Z]?\d{0,3}[A-Z]?)$/i,
  /[\s\-_]*[[(]([A-Z]?\d{0,3}[A-Z]?)[\])]$/i,
];
const legacyNumber = (name: string) => name.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
const clean = (text: string) => text.replace(/_/g, " ").replace(/\s+/g, " ").replace(/^[\s\-–.]+|[\s\-–.]+$/g, "").trim();

export function parseFileName(fileName: string): ParsedName {
  const base = fileName.replace(/\.pdf$/i, "").trim();
  let rest = base;
  let revision = "0";
  for (const pattern of REVISION) {
    const match = rest.match(pattern);
    if (match?.[1]) { revision = match[1].toUpperCase(); rest = rest.slice(0, match.index); break; }
  }
  const number = rest.match(NUMBER);
  if (!number) return { docNumber: legacyNumber(base), title: base, revision: "0", numberFound: false };
  const docNumber = number[1].toUpperCase().replace(/_/g, "-").slice(0, 60);
  const title = clean(rest.slice(number[1].length)) || docNumber;
  return { docNumber, title: title.slice(0, 200), revision: revision.slice(0, 10), numberFound: true };
}

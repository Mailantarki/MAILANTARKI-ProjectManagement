import Link from "next/link";

/** "Rev C · 2 earlier". The earlier count links to the document's history when `href` is given. */
export function RevisionChip({ rev, earlier = 0, href }: { rev: string; earlier?: number; href?: string }) {
  const earlierText = earlier > 0 ? `${earlier} earlier` : "";
  return <span className="revision-chip">
    <span className="revision-chip-rev">Rev {rev}</span>
    {earlierText && (href
      ? <Link className="revision-chip-earlier" href={href} aria-label={`${earlierText} revisions of this document`}>{earlierText}</Link>
      : <span className="revision-chip-earlier">{earlierText}</span>)}
  </span>;
}

import Link from "next/link";

/** Two or three mutually exclusive views as links, so the chosen view lives in the URL and can be shared. */
export function Segmented({ label, options }: {
  label: string; options: { label: string; href: string; active: boolean }[];
}) {
  return <nav className="segmented" aria-label={label}>
    {options.map((option) => <Link key={option.href} href={option.href} scroll={false}
      className={option.active ? "is-active" : undefined} aria-current={option.active ? "true" : undefined}>{option.label}</Link>)}
  </nav>;
}

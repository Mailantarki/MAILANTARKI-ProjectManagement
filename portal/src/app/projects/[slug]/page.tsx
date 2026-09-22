import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getPrincipal } from "../../../lib/auth/principal";
import { parseFilters, projectDocuments } from "../../../lib/documents/list";
import { copy } from "../../../lib/copy";
import { PdfViewerLauncher } from "../../../components/pdf/launcher";
import { ArrowLeft, LogOut, MapPin, Star } from "lucide-react";
import { signOut } from "../sign-out";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ProjectPage({ params, searchParams }: Props) {
  const principal = await getPrincipal();
  if (!principal) redirect("/");
  const { slug } = await params;
  const filters = parseFilters(await searchParams);
  const view = await projectDocuments(principal, slug, filters);
  if (!view) notFound();
  const { project, segment, documents, count, page } = view;
  const href = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...filters, ...patch })) if (value !== undefined && value !== "") next.set(key, String(value));
    return `/projects/${slug}?${next}`;
  };
  return <div className="shell project-shell"><header className="topbar"><Link className="brand" href="/projects">{copy.brand}</Link><form action={signOut}><button className="topbar-action" type="submit"><LogOut size={15} aria-hidden />{copy.signOut}</button></form></header>
    <main className="portal project-detail">
      <section className={`project-hero${project.coverImageUrl ? " has-image" : ""}`} style={project.coverImageUrl ? { backgroundImage: `url("${project.coverImageUrl}")` } : undefined}>
        <Link className="back-link" href="/projects"><ArrowLeft size={15} aria-hidden />All projects</Link>
        <div className="project-heading"><h1>{project.name}</h1><p><MapPin size={16} aria-hidden />{project.location}</p></div>
      </section>
      <nav className="segment-tabs" aria-label="Disciplines">{project.segments.map((item) => <Link key={item.id} className={item.id === segment.id ? "active" : ""} href={href({ segment: item.slug, page: undefined })}>{item.name} <span>{item.count}</span></Link>)}</nav>
      <form className="filters" method="get"><input type="hidden" name="segment" value={segment.slug} />
        <label>Search<input name="q" defaultValue={filters.q ?? ""} placeholder="Title or document number" /></label>
        <label>Type<select name="type" defaultValue={filters.type ?? ""}><option value="">All types</option>{["plan","section","elevation","detail","specification","schedule","report","other"].map((v) => <option key={v} value={v}>{v.replaceAll("_", " ")}</option>)}</select></label>
        <label>Status<select name="status" defaultValue={filters.status ?? ""}><option value="">All statuses</option>{["draft","for_review","issued_for_construction","as_built"].map((v) => <option key={v} value={v}>{v.replaceAll("_", " ")}</option>)}</select></label>
        <label>Revision<input name="revision" defaultValue={filters.revision ?? ""} /></label>
        <label>From<input type="date" name="from" defaultValue={filters.from ?? ""} /></label>
        <label>To<input type="date" name="to" defaultValue={filters.to ?? ""} /></label>
        <button type="submit">Apply filters</button><Link className="clear-filters" href={`/projects/${slug}?segment=${segment.slug}`}>Clear</Link>
      </form>
      <div className="results-count">{count} documents · {segment.name}</div>
      <div className="table-scroll"><table className="document-table"><thead><tr><th>Title</th><th>Number</th><th>Type</th><th>Revision</th><th>Status</th><th>Date</th><th>Size</th><th></th></tr></thead><tbody>
        {documents.map((doc) => <tr key={doc.id}><td className="document-title">{doc.is_featured && <Star className="featured-star" size={14} fill="currentColor" aria-label="Featured" />}{doc.title}</td><td className="document-number">{doc.doc_number}</td><td>{doc.doc_type}</td><td>{doc.revision}</td><td><span className={`status-badge status-${doc.status}`}>{doc.status.replaceAll("_", " ")}</span></td><td>{doc.issue_date ?? "-"}</td><td className="document-size">{(doc.file_size / 1048576).toFixed(1)} MB</td><td><PdfViewerLauncher documentId={doc.id} /></td></tr>)}
      </tbody></table></div>
      {!documents.length && <div className="empty-results">No documents match these filters. <Link href={`/projects/${slug}?segment=${segment.slug}`}>Clear filters</Link></div>}
      {count > 25 && <nav className="pagination" aria-label="Pages">{page > 1 && <Link href={href({ page: String(page - 1) })}>Previous</Link>}<span>Page {page} of {Math.ceil(count / 25)}</span>{page * 25 < count && <Link href={href({ page: String(page + 1) })}>Next</Link>}</nav>}
    </main></div>;
}

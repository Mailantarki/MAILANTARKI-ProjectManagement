import Link from "next/link";
import { withReturnTo } from "@/lib/navigation/project-return";
import { withNext } from "@/lib/auth/next-path";
import { notFound, redirect } from "next/navigation";
import { getIdentity, getPrincipal } from "../../../lib/auth/principal";
import { ALL_SEGMENTS, parseFilters, preload, projectDocuments, type Filters } from "../../../lib/documents/list";
import { ProjectAvatar } from "@/components/shell/project-avatar";
import { CopyLinkButton } from "@/components/ui/copy-link";
import { StatusBadge } from "@/components/ui/status-badge";
import { RevisionChip } from "@/components/ui/revision-chip";
import { Segmented } from "@/components/ui/segmented";
import { z } from "zod";
import { DownloadButton, PdfViewerLauncher } from "../../../components/pdf/launcher";
import { FilterForm } from "@/components/documents/filter-form";
import { DocumentSetProvider } from "@/components/documents/document-set";
import { DocumentPeek } from "@/components/documents/document-peek";
import { VisitBeacon } from "@/components/updates/visit-beacon";
import { MarkSeenButton } from "@/components/updates/mark-seen";
import { WatchButton } from "@/components/updates/watch-button";
import { isWatching, updatesFeed } from "@/lib/updates/feed";
import { ScrollActiveIntoView } from "@/components/documents/scroll-active";
import { isAdminPrincipal } from "../../../lib/auth/authorize";
import { docStatusLabels, docTypeLabels, formatDate, formatFileSize, label } from "@/lib/format";
import { FileArchive, FilePenLine, MapPin, Search, Sparkles, Star, Upload, X } from "lucide-react";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
const types = ["plan", "section", "elevation", "detail", "specification", "schedule", "report", "other"];
const statuses = ["draft", "for_review", "issued_for_construction", "as_built"];
const secondary: (keyof Filters)[] = ["type", "status", "revision", "from", "to"];

export default async function ProjectPage({ params, searchParams }: Props) {
  const { slug } = await params;
  // Start loading with the cookie identity while the session is verified (one round-trip saved).
  const preloaded = preload(await getIdentity(), slug);
  const principal = await getPrincipal();
  if (!principal) redirect(withNext("/", `/projects/${slug}`));
  const search = await searchParams;
  const filters = parseFilters(search);
  // ?open={id} opens the viewer on load (fixed document links redirect here).
  const openId = z.uuid().safeParse(search.open).data;
  // "Show only these": the drawings changed since the last visit (needs the feed first).
  const onlyUpdated = search.updated === "1";
  const feedPromise = updatesFeed(principal);
  const feed = onlyUpdated ? await feedPromise : null;
  const onlyKeys = feed?.feeds.find((f) => f.slug === slug)?.updates.map((u) => `${u.segmentId}:${u.docNumber}`);
  const [view, { feeds }] = await Promise.all([
    projectDocuments(principal, slug, filters, preloaded, openId, onlyUpdated ? onlyKeys ?? [] : undefined), feedPromise,
  ]);
  if (!view) notFound();
  const { project, segment, documents, count, page, pageSize, downloadable, history, opened } = view;
  const updates = feeds.find((f) => f.projectId === project.id)?.updates ?? [];
  const updateBy = new Map(updates.map((u) => [`${u.segmentId}:${u.docNumber}`, u]));
  const watching = await isWatching(principal, project.id);
  const all = segment.id === ALL_SEGMENTS;
  const segmentName = new Map(project.segments.map((s) => [s.id, s.name]));
  const canDownload = new Set(downloadable);
  const href = (patch: Record<string, string | undefined> & { updated?: string }) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...filters, ...(onlyUpdated ? { updated: "1" } : {}), ...patch })) if (value !== undefined && value !== "") next.set(key, String(value));
    return `/projects/${slug}?${next}`;
  };
  const chipText: Partial<Record<keyof Filters, string>> = {
    q: filters.q && `“${filters.q}”`, type: filters.type && label(docTypeLabels, filters.type),
    status: filters.status && label(docStatusLabels, filters.status), revision: filters.revision && `Rev ${filters.revision}`,
    from: filters.from && `From ${formatDate(filters.from)}`, to: filters.to && `To ${formatDate(filters.to)}`,
  };
  const activeChips = (Object.entries(chipText) as [keyof Filters, string | undefined][]).filter(([, text]) => text);
  const first = count ? (page - 1) * pageSize + 1 : 0;
  const last = Math.min(count, page * pageSize);
  const pages = Math.max(1, Math.ceil(count / pageSize));
  const canManage = isAdminPrincipal(principal);
  const viewerDoc = (doc: { id: string; title: string; doc_number: string; revision: string; segment_id: string }) => ({ id: doc.id, title: doc.title,
    subtitle: [doc.doc_number, doc.revision && `Rev ${doc.revision}`, all ? segmentName.get(doc.segment_id) : undefined].filter(Boolean).join(" · ") });
  const noun = history ? (count === 1 ? "revision" : "revisions") : (count === 1 ? "document" : "documents");

  return <DocumentSetProvider documents={documents.map(viewerDoc)}><main className="portal project-detail">
      <header className="project-header">
        <nav className="breadcrumb" aria-label="Breadcrumb"><Link href="/projects">Projects</Link><span aria-hidden>/</span><span aria-current="page">{project.name}</span></nav>
        <div className="project-header-main">
          {project.coverImageUrl
            ? <span className="project-thumb" style={{ backgroundImage: `url("${project.coverImageUrl}")` }} aria-hidden />
            : <ProjectAvatar name={project.name} size="lg" />}
          <div className="project-header-text"><h1>{project.name}</h1>
            <p>{project.location && <><MapPin size={14} aria-hidden />{project.location}<i aria-hidden>·</i></>}
              {project.count} current {project.count === 1 ? "document" : "documents"}</p></div>
          <div className="project-header-actions" role="group" aria-label="Project actions">
            <CopyLinkButton path={`/projects/${slug}`} label="Copy project link" />
            {principal.kind === "user" && <WatchButton projectId={project.id} watching={watching} />}
            {canManage && <Link className="button secondary" href={withReturnTo(`/admin/projects/${slug}/documents`, href({}))}><FilePenLine size={16} aria-hidden />Manage documents</Link>}
            {canManage && <Link className="button" href={withReturnTo(`/admin/projects/${slug}/documents/new`, href({}))}><Upload size={16} aria-hidden />Upload PDFs</Link>}
          </div>
        </div>
      </header>
      <VisitBeacon projectId={project.id} />
      {(updates.length > 0 || onlyUpdated) && <div className="updates-banner" role="status">
        <Sparkles size={16} aria-hidden />
        <span>{onlyUpdated ? `Showing the ${updates.length} ${updates.length === 1 ? "change" : "changes"} since your last visit.`
          : `${updates.length} ${updates.length === 1 ? "change" : "changes"} since your last visit.`}</span>
        {onlyUpdated
          ? <Link className="button secondary" href={href({ updated: undefined, page: undefined })}>Show everything</Link>
          : <Link className="button secondary" href={href({ segment: ALL_SEGMENTS, updated: "1", page: undefined })}>Show only these</Link>}
        <MarkSeenButton projectId={project.id} label="Mark as seen" />
      </div>}
      <ScrollActiveIntoView className="segment-tabs" label="Disciplines">
        {project.segments.length > 1 && <Link className={all ? "active" : ""} aria-current={all ? "page" : undefined}
          href={href({ segment: ALL_SEGMENTS, page: undefined })}>All <span>{project.count}</span></Link>}
        {project.segments.map((item) => {
          const active = item.id === segment.id;
          return <Link key={item.id} className={active ? "active" : item.count === 0 ? "empty-segment" : ""} aria-current={active ? "page" : undefined}
            href={href({ segment: item.slug, page: undefined })}>{item.name} <span>{item.count}</span></Link>;
        })}
      </ScrollActiveIntoView>
      <FilterForm activeCount={secondary.filter((key) => filters[key] !== undefined).length}
        search={<><input type="hidden" name="segment" value={segment.slug} />
          <label className="filter-search"><span>Search</span><span className="search-field"><Search size={16} aria-hidden />
            <input type="search" name="q" defaultValue={filters.q ?? ""} placeholder="Search title or number" autoComplete="off" /></span></label></>}>
        <label>Type<select name="type" defaultValue={filters.type ?? ""}><option value="">All types</option>{types.map((v) => <option key={v} value={v}>{label(docTypeLabels, v)}</option>)}</select></label>
        <label>Status<select name="status" defaultValue={filters.status ?? ""}><option value="">All statuses</option>{statuses.map((v) => <option key={v} value={v}>{label(docStatusLabels, v)}</option>)}</select></label>
        <label>Revision<input type="text" name="revision" defaultValue={filters.revision ?? ""} placeholder="Any" /></label>
        <label>Issued from<input type="date" name="from" defaultValue={filters.from ?? ""} /></label>
        <label>Issued to<input type="date" name="to" defaultValue={filters.to ?? ""} /></label>
      </FilterForm>
      {!!activeChips.length && <div className="filter-chips" aria-label="Active filters">
        {activeChips.map(([key, text]) => <Link key={key} className="filter-chip" href={href({ [key]: undefined, page: undefined })} aria-label={`Remove filter ${text}`}>{text}<X size={14} aria-hidden /></Link>)}
        <Link className="clear-filters" href={`/projects/${slug}?segment=${segment.slug}`}>Clear all</Link>
      </div>}
      <div className="results-bar">
        <div className="results-count" role="status">{count ? `Showing ${first}–${last} of ${count} ${noun}` : `No ${noun}`} · {segment.name}</div>
        {!all && !history && !onlyUpdated && canDownload.has(segment.id) && (project.segments.find((s) => s.id === segment.id)?.count ?? 0) > 0 &&
          <a className="button secondary zip-download" href={`/api/projects/${slug}/zip?segment=${segment.slug}`} download
            title={`Download the current revision of every ${segment.name} document as one ZIP`}><FileArchive size={16} aria-hidden />Download set (ZIP)</a>}
        <Segmented label="Revisions shown" options={[
          { label: "Current set", href: href({ revisions: undefined, page: undefined }), active: !history },
          { label: "All revisions", href: href({ revisions: "all", page: undefined }), active: history },
        ]} />
      </div>
      {!!documents.length && <div className="table-scroll"><table className="document-table responsive-table"><thead><tr><th scope="col">Title</th><th scope="col">Number</th>{all && <th scope="col">Discipline</th>}<th scope="col">Type</th><th scope="col">Revision</th><th scope="col">Status</th><th scope="col">Issued</th><th scope="col">Size</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead><tbody>
        {documents.map((doc) => <tr key={doc.id} className={doc.is_current ? undefined : "is-superseded"}>
          <td className="document-title">{doc.is_featured && <Star className="featured-star" size={14} fill="currentColor" aria-label="Featured" />}<PdfViewerLauncher variant="title" document={viewerDoc(doc)} />
            {doc.is_current && updateBy.has(`${doc.segment_id}:${doc.doc_number}`) && (() => {
              const update = updateBy.get(`${doc.segment_id}:${doc.doc_number}`)!;
              return <span className={`update-badge update-${update.kind}`} title={update.detail}>{update.kind === "new" ? "New" : "Updated"}</span>;
            })()}</td>
          <td className="document-number" data-label="Number">{doc.doc_number}</td>
          {all && <td data-label="Discipline">{segmentName.get(doc.segment_id)}</td>}
          <td data-label="Type">{label(docTypeLabels, doc.doc_type)}</td>
          <td data-label="Revision">{doc.is_current
            ? <RevisionChip rev={doc.revision} earlier={doc.earlier} href={doc.earlier ? href({ revisions: "all", q: doc.doc_number, page: undefined }) : undefined} />
            : <span className="revision-superseded"><RevisionChip rev={doc.revision} /><StatusBadge status="superseded" /></span>}</td>
          <td data-label="Status"><StatusBadge status={doc.status} /></td>
          <td className="document-date" data-label="Issued">{formatDate(doc.issue_date)}</td>
          <td className="document-size" data-label="Size">{formatFileSize(doc.file_size)}</td>
          <td className="document-actions"><PdfViewerLauncher document={viewerDoc(doc)} /><DocumentPeek document={viewerDoc(doc)} />{canDownload.has(doc.segment_id) && <DownloadButton document={viewerDoc(doc)} />}</td>
        </tr>)}
      </tbody></table></div>}
      {!documents.length && <div className="empty-results"><strong>No documents match these filters.</strong>
        <span>{!all && project.segments.length > 1 && (filters.q || activeChips.length)
          ? <><Link href={href({ segment: ALL_SEGMENTS, page: undefined })}>Search all disciplines</Link> or </> : null}
          <Link href={`/projects/${slug}?segment=${segment.slug}`}>clear filters</Link>.</span></div>}
      {opened && <PdfViewerLauncher variant="auto" document={viewerDoc(opened)} />}
      {count > pageSize && <nav className="pagination" aria-label="Pages">
        {page > 1 ? <Link href={href({ page: String(page - 1) })}>Previous</Link> : <span className="pagination-spacer" />}
        <span>Page {page} of {pages}</span>
        {page < pages ? <Link href={href({ page: String(page + 1) })}>Next</Link> : <span className="pagination-spacer" />}
      </nav>}
    </main></DocumentSetProvider>;
}

import Link from "next/link";
import { Fragment } from "react";
import { projectReturn, withReturnTo } from "@/lib/navigation/project-return";
import { notFound } from "next/navigation";
import { authorizeLoadedProject } from "@/lib/auth/authorize";
import { getPrincipal } from "@/lib/auth/principal";
import { getUserClient } from "@/lib/supabase/server";
import { compareRevisions } from "@/lib/documents/revision";
import { AdminForm } from "../../../admin-form";
import { makeDocumentCurrent, setDocumentArchived } from "./actions";
import { DocumentControls } from "./document-controls";
import { ArrowLeft, FilePlus2, Upload } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { docTypeLabels, formatDate, label } from "@/lib/format";

type Segment = { name: string; sort_order: number } | null;
// Many-to-one embeds arrive as an object (older clients typed them as arrays).
const segmentOf = (value: unknown): Segment => (Array.isArray(value) ? value[0] : value as Segment) ?? null;

export default async function AdminDocumentsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ returnTo?: string | string[] }> }) {
  const { slug } = await params;
  const back = projectReturn((await searchParams).returnTo, slug, "/admin/projects");
  const current = withReturnTo(`/admin/projects/${slug}/documents`, back);
  const user = await getUserClient();
  // Project and documents load in one round: documents are matched by project slug (RLS still applies),
  // and the admin check uses the loaded project row instead of a second lookup.
  const [principal, { data: project }, { data: documents, error }] = await Promise.all([
    getPrincipal(),
    user.from("projects").select("id,name,slug,archived_at,organization_id,organizations(archived_at)").eq("slug", slug).maybeSingle(),
    user.from("documents")
      .select("id,title,doc_number,doc_type,revision,status,issue_date,description,file_size,is_featured,archived_at,is_current,superseded_at,segment_id,segments(name,sort_order),projects!inner(slug)")
      .eq("projects.slug", slug).eq("upload_status", "ready")
      .order("doc_number").order("created_at", { ascending: false }),
  ]);
  if (!principal || !project || !(await authorizeLoadedProject(principal, project, "admin_manage"))) notFound();
  if (error) throw new Error("Could not load documents");
  type Row = NonNullable<typeof documents>[number];
  const active = (documents ?? []).filter((document) => !document.archived_at);
  const archived = (documents ?? []).filter((document) => document.archived_at);

  // One entry per drawing number and discipline: the current revision plus its history.
  const groups = new Map<string, Row[]>();
  for (const document of active) {
    const key = `${document.segment_id}/${document.doc_number}`;
    groups.set(key, [...(groups.get(key) ?? []), document]);
  }
  const drawings = [...groups.values()].map((rows) => {
    const sorted = [...rows].sort((a, b) => Number(b.is_current) - Number(a.is_current) || compareRevisions(b.revision, a.revision));
    return { head: sorted[0], earlier: sorted.slice(1) };
  }).sort((a, b) => (segmentOf(a.head.segments)?.sort_order ?? 0) - (segmentOf(b.head.segments)?.sort_order ?? 0)
    || Number(b.head.is_featured) - Number(a.head.is_featured) || a.head.doc_number.localeCompare(b.head.doc_number));
  const revisionCount = active.length;

  const controls = (document: Row) => <DocumentControls document={{
    id: document.id, title: document.title, docNumber: document.doc_number,
    docType: document.doc_type, revision: document.revision, status: document.status,
    issueDate: document.issue_date, description: document.description, featured: document.is_featured,
  }} />;
  const archiveForm = (document: Row, isArchived: boolean) => <AdminForm action={setDocumentArchived}
    label={isArchived ? "Restore" : "Archive"} danger={!isArchived}
    confirmMessage={isArchived ? undefined : `Archive ${document.doc_number} Rev ${document.revision}?${document.is_current ? " The previous revision becomes current." : ""}`}>
    <input type="hidden" name="id" value={document.id} />
    <input type="hidden" name="archived" value={String(!isArchived)} />
  </AdminForm>;
  const newRevision = (document: Row) => withReturnTo(`/admin/projects/${project.slug}/documents/new?revisionOf=${document.id}`, current);

  return <main className="main portal"><Link className="back-link" href={back}><ArrowLeft size={15} aria-hidden />{back.startsWith("/projects/") ? "Back to project" : "Projects"}</Link>
    <div className="eyebrow">{project.name}</div>
    <div className="admin-page-title"><h1>Documents</h1>
      {!project.archived_at && <Link className="button" href={withReturnTo(`/admin/projects/${project.slug}/documents/new`, current)}><Upload size={16} aria-hidden />Upload PDFs</Link>}</div>
    {project.archived_at && <p>This project is archived. Restore the project before restoring documents.</p>}
    <section className="admin-section"><h2>Active ({drawings.length} {drawings.length === 1 ? "drawing" : "drawings"}{revisionCount > drawings.length ? `, ${revisionCount} revisions` : ""})</h2>
      {!drawings.length ? <p className="empty-results">No active documents.</p> :
      <div className="table-scroll"><table className="document-table responsive-table admin-drawings"><thead><tr>
        <th>Document</th><th>Discipline</th><th>Number</th><th>Type</th><th>Revision</th><th>Status</th><th>Issue date</th><th>Actions</th>
      </tr></thead><tbody>{drawings.map(({ head, earlier }) => <Fragment key={head.id}>
        <tr>
          <td className="document-title">{head.title}</td><td data-label="Discipline">{segmentOf(head.segments)?.name ?? "-"}</td>
          <td className="document-number" data-label="Number">{head.doc_number}</td><td data-label="Type">{label(docTypeLabels, head.doc_type)}</td>
          <td data-label="Revision"><strong>Rev {head.revision}</strong>{!head.is_current && <> <StatusBadge status="superseded" /></>}</td>
          <td data-label="Status"><StatusBadge status={head.status} /></td>
          <td data-label="Issued">{formatDate(head.issue_date)}</td>
          <td className="document-actions"><div className="document-admin-actions">
            {controls(head)}
            {!project.archived_at && <Link className="button secondary" href={newRevision(head)}><FilePlus2 size={14} aria-hidden />New revision</Link>}
            {archiveForm(head, false)}
          </div></td>
        </tr>
        {!!earlier.length && <tr className="revision-history-row"><td colSpan={8}>
          <details><summary>{earlier.length} earlier {earlier.length === 1 ? "revision" : "revisions"}</summary>
            <ul className="revision-history">{earlier.map((document) => <li key={document.id}>
              <span className="revision-history-rev">Rev {document.revision}</span>
              <StatusBadge status={document.status} />
              <span className="revision-history-meta">Issued {formatDate(document.issue_date)}
                {document.superseded_at ? ` · superseded ${formatDate(document.superseded_at)}` : ""}</span>
              <span className="document-admin-actions">
                <AdminForm action={makeDocumentCurrent} label="Make current" successMessage={`Rev ${document.revision} is now current`}
                  confirmMessage={`Make Rev ${document.revision} the current revision of ${document.doc_number}? Rev ${head.revision} moves to the history.`}>
                  <input type="hidden" name="id" value={document.id} />
                </AdminForm>
                {controls(document)}
                {archiveForm(document, false)}
              </span>
            </li>)}</ul>
          </details>
        </td></tr>}
      </Fragment>)}</tbody></table></div>}
    </section>
    <section className="admin-section"><h2>Archived ({archived.length})</h2>
      {!archived.length ? <p className="empty-results">No archived documents.</p> :
      <div className="table-scroll"><table className="document-table responsive-table"><thead><tr>
        <th>Document</th><th>Discipline</th><th>Number</th><th>Type</th><th>Revision</th><th>Status</th><th>Issue date</th><th>Actions</th>
      </tr></thead><tbody>{archived.map((document) => <tr key={document.id}>
        <td className="document-title">{document.title}</td><td data-label="Discipline">{segmentOf(document.segments)?.name ?? "-"}</td>
        <td className="document-number" data-label="Number">{document.doc_number}</td><td data-label="Type">{label(docTypeLabels, document.doc_type)}</td>
        <td data-label="Revision">Rev {document.revision}</td><td data-label="Status"><StatusBadge status={document.status} /></td>
        <td data-label="Issued">{formatDate(document.issue_date)}</td>
        <td className="document-actions"><div className="document-admin-actions">{archiveForm(document, true)}</div></td>
      </tr>)}</tbody></table></div>}
    </section>
  </main>;
}

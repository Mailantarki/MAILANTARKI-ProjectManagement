import Link from "next/link";
import { notFound } from "next/navigation";
import { authorize } from "@/lib/auth/authorize";
import { getPrincipal } from "@/lib/auth/principal";
import { getUserClient } from "@/lib/supabase/server";
import { AdminForm } from "../../../admin-form";
import { setDocumentArchived } from "./actions";

export default async function AdminDocumentsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const principal = await getPrincipal();
  if (!principal) notFound();
  const user = await getUserClient();
  const { data: project } = await user.from("projects")
    .select("id,name,slug,archived_at").eq("slug", slug).maybeSingle();
  if (!project || !(await authorize(principal,
    { projectId: project.id, segmentId: "00000000-0000-0000-0000-000000000000" }, "admin_manage"))) notFound();
  const { data: documents, error } = await user.from("documents")
    .select("id,title,doc_number,doc_type,revision,status,issue_date,file_size,archived_at,segments(name)")
    .eq("project_id", project.id).eq("upload_status", "ready")
    .order("created_at", { ascending: false });
  if (error) throw new Error("Could not load documents");
  const active = (documents ?? []).filter((document) => !document.archived_at);
  const archived = (documents ?? []).filter((document) => document.archived_at);

  function list(items: typeof active, isArchived: boolean) {
    if (!items.length) return <p className="empty-results">No {isArchived ? "archived" : "active"} documents.</p>;
    return <div className="table-wrap"><table className="data-table"><thead><tr>
      <th>Document</th><th>Segment</th><th>Number</th><th>Type</th><th>Revision</th><th>Status</th><th>Issue date</th><th></th>
    </tr></thead><tbody>{items.map((document) => <tr key={document.id}>
      <td>{document.title}</td><td>{document.segments?.[0]?.name ?? "-"}</td>
      <td>{document.doc_number ?? "-"}</td><td>{document.doc_type}</td>
      <td>{document.revision ?? "-"}</td><td>{document.status ?? "-"}</td>
      <td>{document.issue_date ?? "-"}</td><td><AdminForm action={setDocumentArchived}
        label={isArchived ? "Restore" : "Archive"}
        confirmMessage={isArchived ? undefined : `Archive ${document.title}?`}>
        <input type="hidden" name="id" value={document.id} />
        <input type="hidden" name="archived" value={String(!isArchived)} />
      </AdminForm></td>
    </tr>)}</tbody></table></div>;
  }

  return <main className="main portal"><div className="eyebrow">{project.name}</div><h1>Documents</h1>
    <p><Link href="/admin/projects">Projects</Link>{!project.archived_at && <>{" · "}<Link href={`/admin/projects/${project.slug}/documents/new`}>Upload PDFs</Link></>}</p>
    {project.archived_at && <p>This project is archived. Restore the project before restoring documents.</p>}
    <section className="admin-section"><h2>Active ({active.length})</h2>{list(active, false)}</section>
    <section className="admin-section"><h2>Archived ({archived.length})</h2>{list(archived, true)}</section>
  </main>;
}

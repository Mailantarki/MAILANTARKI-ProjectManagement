import "server-only";
import { getAdminClient } from "../supabase/admin";

/**
 * Publish emails (SPEC-ui-ux Fase 5): one email per person per publish batch, only to people with
 * access to the disciplines that changed, never to someone who turned the project off. Links are the
 * fixed document links (sign-in still required); never signed file URLs.
 */
export type PublishedDocument = { segmentId: string; docNumber: string; title: string; revision: string; kind: "new" | "revised" };

/** User ids with a grant on the project for any of these disciplines (or the whole project). */
export async function publishAudience(projectId: string, segmentIds: string[], actorId: string) {
  const admin = getAdminClient();
  const [grants, watchers] = await Promise.all([
    admin.from("user_project_access").select("user_id,segment_id,profiles(suspended_at)").eq("project_id", projectId),
    admin.from("project_watchers").select("user_id").eq("project_id", projectId).eq("enabled", false),
  ]);
  if (grants.error) throw grants.error;
  const off = new Set((watchers.data ?? []).map((w) => w.user_id));
  const ids = new Set<string>();
  for (const grant of grants.data ?? []) {
    const profile = (Array.isArray(grant.profiles) ? grant.profiles[0] : grant.profiles) as { suspended_at: string | null } | null;
    if (!profile || profile.suspended_at || off.has(grant.user_id) || grant.user_id === actorId) continue;
    if (grant.segment_id === null || segmentIds.includes(grant.segment_id)) ids.add(grant.user_id);
  }
  return [...ids];
}

const escape = (text: string) => text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function publishEmail(input: { projectName: string; projectUrl: string; documents: (PublishedDocument & { url: string })[] }) {
  const n = input.documents.length;
  const subject = `${input.projectName}: ${n} ${n === 1 ? "document" : "documents"} published`;
  const lines = input.documents.map((d) => `${d.kind === "new" ? "New" : "New revision"} · ${d.docNumber} ${d.title} · Rev ${d.revision}\n${d.url}`);
  const text = `${subject}\n\n${lines.join("\n\n")}\n\nOpen the project: ${input.projectUrl}\n\nYou get this email because you have access to this project. To stop these emails, open the project and click "Watching".`;
  const rows = input.documents.map((d) => `<tr><td style="padding:8px 0;border-top:1px solid #e6ece8">
    <span style="display:inline-block;padding:1px 8px;border-radius:999px;background:${d.kind === "new" ? "#e3f1ec" : "#fdf1dc"};color:${d.kind === "new" ? "#1f5f4c" : "#8a5300"};font-size:11px;font-weight:700">${d.kind === "new" ? "New" : "New revision"}</span>
    <a href="${escape(d.url)}" style="color:#173a30;font-weight:600;text-decoration:none;margin-left:6px">${escape(d.docNumber)} · ${escape(d.title)}</a>
    <span style="color:#5d6b65"> · Rev ${escape(d.revision)}</span></td></tr>`).join("");
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1d2a25;max-width:560px">
  <p style="font-size:16px;font-weight:600;margin:0 0 12px">${escape(input.projectName)}: ${n} ${n === 1 ? "document" : "documents"} published</p>
  <table style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table>
  <p style="margin:20px 0"><a href="${escape(input.projectUrl)}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#1f5f4c;color:#fff;text-decoration:none;font-weight:600">Open the project</a></p>
  <p style="color:#5d6b65;font-size:12px">You get this email because you have access to this project. To stop these emails, open the project and click "Watching".</p></div>`;
  return { subject, text, html };
}

/** Sends the batch email to each recipient separately. Without RESEND_API_KEY nothing is sent. */
export async function sendPublishEmails(userIds: string[], email: ReturnType<typeof publishEmail>) {
  const key = process.env.RESEND_API_KEY;
  if (!key || !userIds.length) return { sent: 0, configured: !!key };
  const from = process.env.EMAIL_FROM || "Mailantarki Portal <portal@mailantarki.com>";
  const admin = getAdminClient();
  const users = await Promise.all(userIds.map((id) => admin.auth.admin.getUserById(id)));
  const addresses = users.map((u) => u.data.user?.email).filter((e): e is string => !!e);
  let sent = 0;
  for (const to of addresses) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject: email.subject, html: email.html, text: email.text }),
    }).catch(() => null);
    if (response?.ok) sent++;
  }
  return { sent, configured: true };
}

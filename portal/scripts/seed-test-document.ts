import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { z } from "zod";
import { admin, cliEnv } from "./cli-common";

const args = process.argv.slice(2);
const option = (flag: string) => {
  const index = args.indexOf(`--${flag}`);
  return index >= 0 ? args[index + 1] : undefined;
};

async function samplePdf(projectName: string, segmentName: string) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let number = 1; number <= 3; number++) {
    const page = pdf.addPage([842, 595]);
    page.drawText(projectName, { x: 55, y: 510, size: 24, font, color: rgb(0.12, 0.24, 0.2) });
    page.drawText(segmentName, { x: 55, y: 468, size: 17, font });
    page.drawText(`Sample drawing / Sheet ${number} of 3`, { x: 55, y: 420, size: 14, font });
    page.drawRectangle({ x: 55, y: 95, width: 730, height: 290, borderWidth: 2,
      borderColor: rgb(0.2, 0.4, 0.34) });
    page.drawLine({ start: { x: 75, y: 120 }, end: { x: 760, y: 360 }, thickness: 1 });
  }
  return Buffer.from(await pdf.save());
}

async function main() {
  const host = new URL(cliEnv.NEXT_PUBLIC_SUPABASE_URL).hostname;
  if (host !== "localhost" && host !== "127.0.0.1")
    throw new Error("This seed is restricted to local Supabase");
  const projectSlug = z.string().min(1).parse(option("project") ?? "mailantarki-sports-complex");
  const segmentSlug = z.string().min(1).parse(option("segment") ?? "architecture");
  const inputFile = args.find((arg) => !arg.startsWith("--") &&
    args[args.indexOf(arg) - 1] !== "--project" && args[args.indexOf(arg) - 1] !== "--segment");
  const [{ data: project, error: projectError }, { data: segment, error: segmentError }] = await Promise.all([
    admin.from("projects").select("id,name").eq("slug", projectSlug).is("archived_at", null).single(),
    admin.from("segments").select("id,name,slug").eq("slug", segmentSlug).single(),
  ]);
  if (projectError || segmentError || !project || !segment) throw new Error("Project or segment not found");
  const buffer = inputFile ? await readFile(inputFile) : await samplePdf(project.name, segment.name);
  if (buffer.length < 5 || buffer.subarray(0, 5).toString() !== "%PDF-" || buffer.length > 50 * 1024 * 1024)
    throw new Error("Input must be a PDF up to 50 MB");
  const id = randomUUID();
  const path = `projects/${project.id}/${segment.slug}/${id}.pdf`;
  const { error: insertError } = await admin.from("documents").insert({
    id, project_id: project.id, segment_id: segment.id, title: `Sample ${segment.name}`,
    doc_number: `TEST-${segment.slug.toUpperCase()}-${id.slice(0, 8)}`,
    doc_type: "plan", revision: "A", status: "issued_for_construction",
    issue_date: new Date().toISOString().slice(0, 10), file_path: path,
    file_size: buffer.length, upload_status: "pending",
  });
  if (insertError) throw insertError;
  try {
    const { error: uploadError } = await admin.storage.from("documents").upload(path, buffer,
      { contentType: "application/pdf", upsert: false });
    if (uploadError) throw uploadError;
    const { error: readyError } = await admin.from("documents").update({ upload_status: "ready" }).eq("id", id);
    if (readyError) throw readyError;
  } catch (error) {
    await admin.storage.from("documents").remove([path]);
    await admin.from("documents").delete().eq("id", id);
    throw error;
  }
  console.log(`Seeded sample document ${id} for ${projectSlug} / ${segmentSlug}`);
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "Seed failed"); process.exitCode = 1; });

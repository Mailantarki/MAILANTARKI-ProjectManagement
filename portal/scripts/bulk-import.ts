import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { input, password } from "@inquirer/prompts";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const MAX_BYTES = 50 * 1024 * 1024;
const args = z.object({ directory: z.string().min(1), project: z.string().min(1), segment: z.string().min(1) });

export function metadataFromFilename(filename: string) {
  const title = basename(filename, ".pdf").replace(/^MAURITIUS\s*-\s*/i, "").trim();
  const docNumber = `${filename.toUpperCase().startsWith("MAURITIUS - ") ? "MAURITIUS-" : ""}${title.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
  return { title, docNumber };
}

export function validatePdf(buffer: Buffer): string | null {
  if (buffer.length < 5 || buffer.subarray(0, 5).toString("ascii") !== "%PDF-") return "Invalid PDF signature";
  if (buffer.length > MAX_BYTES) return "Exceeds 50 MB";
  return null;
}

function parseArgs(argv: string[]) {
  const value: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, "");
    if (!key || !["directory", "project", "segment"].includes(key)) throw new Error("Usage: --directory PATH --project SLUG --segment SLUG");
    value[key] = argv[i + 1];
  }
  return args.parse(value);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { admin, cliEnv } = await import("./cli-common");
  const env = z.object({ NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1) }).parse(process.env);
  const directory = resolve(options.directory);
  const names = (await readdir(directory)).filter((name) => name.toLowerCase().endsWith(".pdf")).sort();
  if (!names.length) throw new Error("No PDF files found");

  // Validate the entire batch before any metadata or Storage writes.
  const files = await Promise.all(names.map(async (name) => {
    const bytes = await readFile(resolve(directory, name));
    const metadata = metadataFromFilename(name);
    const reason = validatePdf(bytes) ?? (metadata.title.length < 1 || metadata.title.length > 200 ||
      metadata.docNumber.length < 1 || metadata.docNumber.length > 60 ? "Invalid title or document number" : null);
    return { name, bytes, metadata, reason };
  }));
  const rejected = files.filter((file) => file.reason);
  if (rejected.length) {
    for (const file of rejected) console.error(`Rejected ${file.name}: ${file.reason}`);
    console.log(`0 uploaded / 0 duplicates / ${rejected.length} rejected; batch unchanged.`);
    process.exitCode = 1;
    return;
  }
  const numbers = files.map((file) => file.metadata.docNumber);
  if (new Set(numbers).size !== numbers.length) throw new Error("Two filenames map to the same document number");

  const email = z.email().parse(await input({ message: "Admin email:" }));
  const secret = await password({ message: "Admin password:", mask: "*" });
  const user = createClient(cliEnv.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: session, error: loginError } = await user.auth.signInWithPassword({ email, password: secret });
  if (loginError || !session.user) throw new Error("Invalid email or password");
  const { data: project } = await user.from("projects").select("id").eq("slug", options.project).is("archived_at", null).maybeSingle();
  const { data: segment } = await user.from("segments").select("id,slug").eq("slug", options.segment).maybeSingle();
  if (!project || !segment) throw new Error("Project or segment unavailable");
  const { data: profile } = await user.from("profiles").select("role,organization_id").eq("id", session.user.id).single();
  if (!profile || profile.role === "member") throw new Error("Not authorized");

  let uploaded = 0;
  let duplicates = 0;
  for (const file of files) {
    const { data: matches, error: findError } = await user.from("documents").select("id,upload_status")
      .eq("project_id", project.id).eq("segment_id", segment.id)
      .eq("doc_number", file.metadata.docNumber).eq("revision", "0")
      .is("archived_at", null).order("created_at", { ascending: false });
    if (findError) throw new Error(`Lookup failed: ${findError.message}`);
    if (matches?.some((match) => match.upload_status === "ready")) { duplicates++; continue; }
    const existing = matches?.[0];
    const id = existing?.id ?? randomUUID();
    const path = `projects/${project.id}/${segment.slug}/${id}.pdf`;
    if (!existing) {
      const { error } = await user.from("documents").insert({
        id, project_id: project.id, segment_id: segment.id, title: file.metadata.title,
        doc_number: file.metadata.docNumber, doc_type: "plan", revision: "0", status: "draft",
        file_size: file.bytes.length, upload_status: "pending",
      });
      if (error) throw new Error(error.code === "23505" ? `Duplicate document: ${file.metadata.docNumber}` : `Insert failed: ${error.message}`);
    }
    const storage = admin.storage.from("documents");
    const { data: object, error: infoError } = await storage.info(path);
    if (infoError && !infoError.message.toLowerCase().includes("not found"))
      throw new Error(`${file.name}: could not inspect existing upload`);
    let errorMessage = "Upload failed";
    if (!object) for (let attempt = 0; attempt < 3; attempt++) {
      const { data: ticket, error: ticketError } = await storage.createSignedUploadUrl(path);
      if (ticketError || !ticket) { errorMessage = ticketError?.message ?? "Could not sign upload"; continue; }
      const { error: uploadError } = await storage.uploadToSignedUrl(path, ticket.token, file.bytes,
        { contentType: "application/pdf" });
      if (!uploadError) { errorMessage = ""; break; }
      errorMessage = uploadError.message;
      if (uploadError.message.includes("already exists")) break;
    }
    else errorMessage = "";
    if (errorMessage) throw new Error(`${file.name}: ${errorMessage}; pending row retained for retry`);
    const { data: uploadedObject, error: uploadedInfoError } = await storage.info(path);
    if (uploadedInfoError || !uploadedObject || uploadedObject.size !== file.bytes.length)
      throw new Error(`${file.name}: uploaded object size mismatch; pending row retained`);
    const { data: signed, error: signedError } = await storage.createSignedUrl(path, 60);
    if (signedError || !signed) throw new Error(`${file.name}: could not inspect uploaded PDF`);
    const response = await fetch(signed.signedUrl, { headers: { Range: "bytes=0-4" }, cache: "no-store" });
    if (response.status !== 206 || new TextDecoder().decode(await response.arrayBuffer()) !== "%PDF-")
      throw new Error(`${file.name}: uploaded object is not a valid PDF; pending row retained`);
    const { error: readyError } = await admin.rpc("finalize_document_upload", {
      p_document_id: id, p_file_size: uploadedObject.size,
    });
    if (readyError) throw new Error(`${file.name}: finalization failed; pending row retained: ${readyError.message}`);
    uploaded++;
  }
  console.log(`${uploaded} uploaded / ${duplicates} duplicates / 0 rejected.`);
}

if (!process.env.VITEST) main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Bulk import failed");
  process.exitCode = 1;
});

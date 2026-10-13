import { z } from "zod";

export const MAX_PDF_BYTES = 50 * 1024 * 1024;
const date = z.iso.date();

export const documentMetaSchema = z.object({
  projectId: z.uuid(),
  segmentId: z.uuid(),
  title: z.string().trim().min(1).max(200),
  docNumber: z.string().trim().min(1).max(60),
  docType: z.enum(["plan", "section", "elevation", "detail", "specification", "schedule", "report", "other"]),
  revision: z.string().trim().min(1).max(10),
  status: z.enum(["draft", "for_review", "issued_for_construction", "as_built"]),
  issueDate: date.nullable(),
  description: z.string().trim().max(1000),
  fileSize: z.number().int().min(5).max(MAX_PDF_BYTES),
});

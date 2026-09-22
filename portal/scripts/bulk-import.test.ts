import { describe, expect, it } from "vitest";
import { metadataFromFilename, validatePdf } from "./bulk-import";

describe("bulk import preflight", () => {
  it("retains the existing Mauritius document number for idempotency", () => {
    expect(metadataFromFilename("MAURITIUS - FLOOR TYPE 7-A (lower level).pdf"))
      .toEqual({ title: "FLOOR TYPE 7-A (lower level)", docNumber: "MAURITIUS-FLOOR-TYPE-7-A-LOWER-LEVEL" });
  });
  it("rejects false magic bytes before upload", () => {
    expect(validatePdf(Buffer.from("not a real pdf"))).toBe("Invalid PDF signature");
    expect(validatePdf(Buffer.from("%PDF-1.7"))).toBeNull();
  });
  it("rejects oversized files", () => {
    const huge = Buffer.alloc(50 * 1024 * 1024 + 1);
    huge.write("%PDF-");
    expect(validatePdf(huge)).toBe("Exceeds 50 MB");
  });
});

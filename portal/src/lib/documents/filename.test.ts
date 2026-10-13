import { describe, expect, it } from "vitest";
import { parseFileName } from "./filename";

describe("parseFileName", () => {
  it.each([
    ["A-101 Ground floor plan Rev B.pdf", { docNumber: "A-101", title: "Ground floor plan", revision: "B" }],
    ["A101_Ground_Floor_Plan_rev_C.pdf", { docNumber: "A101", title: "Ground Floor Plan", revision: "C" }],
    ["S-201.1 - Foundation details (B).pdf", { docNumber: "S-201.1", title: "Foundation details", revision: "B" }],
    ["ARQ-PL-001 Planta baja.pdf", { docNumber: "ARQ-PL-001", title: "Planta baja", revision: "0" }],
    ["M-01 North duct R2.PDF", { docNumber: "M-01", title: "North duct", revision: "2" }],
    ["E-300.pdf", { docNumber: "E-300", title: "E-300", revision: "0" }],
  ])("reads %s", (name, expected) => expect(parseFileName(name)).toEqual({ ...expected, numberFound: true }));

  it.each([
    ["UPLOAD-1A2B3C4D5E6F.pdf", "UPLOAD-1A2B3C4D5E6F", "UPLOAD-1A2B3C4D5E6F"],
    ["Section A-A.pdf", "SECTION-A-A", "Section A-A"],
    ["Plano 3.pdf", "PLANO-3", "Plano 3"],
  ])("keeps the previous behaviour for %s", (name, docNumber, title) => {
    expect(parseFileName(name)).toEqual({ docNumber, title, revision: "0", numberFound: false });
  });
});

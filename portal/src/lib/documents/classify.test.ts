import { describe, expect, it } from "vitest";
import { classifyUploads, describeClassification } from "./classify";

const S = "seg-a";
const row = (key: string, docNumber: string, revision: string, segmentId = S) => ({ key, segmentId, docNumber, revision });
const stored = (docNumber: string, revision: string, isCurrent: boolean, segmentId = S) => ({ segmentId, docNumber, revision, isCurrent });

describe("classifyUploads", () => {
  it("gives each file of the review table its outcome", () => {
    const result = classifyUploads([
      row("new", "A-900", "A"),
      row("rev", "A-101", "C"),
      row("old", "A-102", "A"),
      row("dup", "A-103", "b"),
      row("none", " ", "A"),
    ], [
      stored("A-101", "A", false), stored("A-101", "B", true),
      stored("A-102", "B", true),
      stored("A-103", "B", true),
    ]);
    expect(result).toEqual({
      new: { kind: "new_drawing" },
      rev: { kind: "new_revision", supersedes: "B" },
      old: { kind: "earlier_revision", current: "B" },
      dup: { kind: "conflict", existing: "B", suggestion: "C", inUpload: false },
      none: { kind: "missing_number" },
    });
    expect(describeClassification(result.rev)).toBe("New revision · Rev B becomes superseded");
  });

  it("simulates several revisions of one number in the same upload", () => {
    expect(classifyUploads([row("b", "S-1", "B"), row("a", "S-1", "A"), row("a2", "S-1", "A")], [])).toEqual({
      a: { kind: "new_drawing" },
      b: { kind: "new_revision", supersedes: "A" },
      a2: { kind: "conflict", existing: "A", suggestion: "C", inUpload: true },
    });
  });

  it("treats the same number in another discipline as another drawing", () => {
    expect(classifyUploads([row("x", "A-101", "A", "seg-b")], [stored("A-101", "A", true)])).toEqual({ x: { kind: "new_drawing" } });
  });
});

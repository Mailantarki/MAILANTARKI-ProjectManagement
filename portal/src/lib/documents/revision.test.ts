import { describe, expect, it } from "vitest";
import { compareRevisions, nextRevision, revisionSortKey } from "./revision";
import { EQUIVALENT_REVISIONS, ORDERED_REVISIONS } from "./revision-cases";

describe("revision order", () => {
  it("orders numbers before letters, numerically and by length", () => {
    const shuffled = [...ORDERED_REVISIONS].reverse();
    expect(shuffled.sort(compareRevisions)).toEqual(ORDERED_REVISIONS);
  });
  it("ignores case, spaces and a leading Rev", () => {
    for (const [a, b] of EQUIVALENT_REVISIONS) expect(revisionSortKey(a)).toBe(revisionSortKey(b));
  });
  it("suggests the next revision", () => {
    expect(nextRevision("B")).toBe("C");
    expect(nextRevision("Z")).toBe("AA");
    expect(nextRevision("AZ")).toBe("BA");
    expect(nextRevision("P02")).toBe("P03");
    expect(nextRevision("9")).toBe("10");
    expect(nextRevision("0")).toBe("1");
    expect(nextRevision("")).toBe("A");
  });
});

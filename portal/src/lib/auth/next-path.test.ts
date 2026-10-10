import { describe, expect, it } from "vitest";
import { safeNext, withNext } from "./next-path";

describe("safeNext", () => {
  it("accepts project paths of this site", () => {
    expect(safeNext("/projects")).toBe("/projects");
    expect(safeNext("/projects/maylan-plaza")).toBe("/projects/maylan-plaza");
    expect(safeNext("/projects/maylan-plaza/documents/A-101")).toBe("/projects/maylan-plaza/documents/A-101");
    expect(safeNext("/projects/maylan-plaza/documents/A%20101")).toBe("/projects/maylan-plaza/documents/A%20101");
  });
  it("rejects anything that could leave the site or reach other areas", () => {
    for (const value of ["//evil.com", "https://evil.com", "/projects/../admin", "/admin", "/projects/a?x=1", "/projects/A", "/projects/a/documents/", "/projects/a/documents/x/y", "", undefined, ["/projects"]]) {
      expect(safeNext(value)).toBeNull();
    }
  });
});

describe("withNext", () => {
  it("adds the destination only when present", () => {
    expect(withNext("/login", "/projects/maylan-plaza")).toBe("/login?next=%2Fprojects%2Fmaylan-plaza");
    expect(withNext("/login", null)).toBe("/login");
  });
});

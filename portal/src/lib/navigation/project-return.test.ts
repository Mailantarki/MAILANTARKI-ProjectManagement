import { describe, expect, it } from "vitest";
import { projectReturn, withReturnTo } from "./project-return";

describe("project return navigation", () => {
  const portal = "/projects/maylan-plaza?segment=interior-design&status=draft&page=2";
  const documents = "/admin/projects/maylan-plaza/documents";
  it("preserves the project's discipline, filters and pagination", () => {
    expect(projectReturn(portal, "maylan-plaza", "/admin/projects")).toBe(portal);
  });
  it("preserves the return chain through uploads", () => {
    const current = withReturnTo(documents, portal);
    expect(projectReturn(current, "maylan-plaza", documents)).toBe(current);
  });
  it.each([undefined, [portal], "https://example.com", "//example.com", "/projects/other", "/projects/maylan-plaza/../other", "javascript:alert(1)"])("rejects unrelated destinations: %s", (value) => {
    expect(projectReturn(value, "maylan-plaza", "/admin/projects")).toBe("/admin/projects");
  });
  it("discards unsafe nested return destinations", () => {
    expect(projectReturn(withReturnTo(documents, "https://example.com"), "maylan-plaza", documents))
      .toBe(withReturnTo(documents, "/admin/projects"));
  });
});

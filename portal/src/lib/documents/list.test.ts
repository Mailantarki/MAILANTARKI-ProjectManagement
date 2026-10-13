import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { parseFilters } from "./list";

describe("URL filters", () => {
  it("accepts all valid fields together and independently", () => {
    const input = { segment: "mep", type: "plan", status: "draft", revision: "A", from: "2026-01-01", to: "2026-12-31", q: "  pool pump  ", page: "2" };
    expect(parseFilters(input)).toEqual({ ...input, q: "pool pump", page: 2 });
    for (const [key, value] of Object.entries(input)) expect(Object.keys(parseFilters({ [key]: value }))).toEqual([key]);
  });
  it("ignores invalid fields without losing the other filters", () => {
    expect(parseFilters({ segment: "architecture", type: "injected", from: "not-a-date", page: "0", status: "draft" }))
      .toEqual({ segment: "architecture", status: "draft" });
  });
  it("is stable when shared as URL search parameters", () => {
    const params = new URLSearchParams({ segment: "mep", type: "report", q: "north lobby", page: "3" });
    expect(parseFilters(Object.fromEntries(params))).toEqual(parseFilters(Object.fromEntries(new URL(`https://example.test/projects/foo?${params}`).searchParams)));
  });
});

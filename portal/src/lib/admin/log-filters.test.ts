import { describe, expect, it } from "vitest";
import { applyLogFilters, parseLogFilters } from "./log-filters";

describe("access log filters", () => {
  it("ignores invalid query fields without discarding valid filters", () => {
    expect(parseLogFilters({ action: "view", userId: "bad", page: "garbage" })).toEqual({ action: "view", page: 1 });
  });
  it("accepts a document search and drops one that could break the PostgREST filter", () => {
    expect(parseLogFilters({ q: " A-101 " })).toEqual({ q: "A-101", page: 1 });
    expect(parseLogFilters({ q: "x),user_id.eq.1" })).toEqual({ page: 1 });
  });
  it("searches title and number together", () => {
    const calls: string[] = [];
    const query = { or: (value: string) => { calls.push(value); return query; } };
    applyLogFilters(query, { q: "Lobby", page: 1 });
    expect(calls).toEqual(["document_title.ilike.*Lobby*,doc_number.ilike.*Lobby*"]);
  });
  it("accepts a valid date range and page", () => {
    expect(parseLogFilters({ from: "2026-09-01", to: "2026-09-30", page: "2" }))
      .toEqual({ from: "2026-09-01", to: "2026-09-30", page: 2 });
  });
});

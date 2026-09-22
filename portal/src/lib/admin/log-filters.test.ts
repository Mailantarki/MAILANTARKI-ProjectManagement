import { describe, expect, it } from "vitest";
import { parseLogFilters } from "./log-filters";

describe("access log filters", () => {
  it("ignores invalid query fields without discarding valid filters", () => {
    expect(parseLogFilters({ action: "view", userId: "bad", page: "garbage" })).toEqual({ action: "view", page: 1 });
  });
  it("accepts a valid date range and page", () => {
    expect(parseLogFilters({ from: "2026-09-01", to: "2026-09-30", page: "2" }))
      .toEqual({ from: "2026-09-01", to: "2026-09-30", page: 2 });
  });
});

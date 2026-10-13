import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("../supabase/admin", () => ({ getAdminClient: () => ({}) }));
vi.mock("../documents/list", () => ({ searchScope: async () => ({}) }));
const { effectiveSince } = await import("./feed");
const { formatRelative } = await import("../format");

describe("effectiveSince", () => {
  const now = Date.parse("2026-10-10T12:00:00Z");
  it("has no since before the first visit", () => expect(effectiveSince(undefined, now)).toBeNull());
  it("counts from the last visit when this visit has not been recorded yet", () => {
    expect(effectiveSince({ previous_seen_at: "2026-10-01T00:00:00Z", last_seen_at: "2026-10-08T09:00:00Z" }, now)).toBe("2026-10-08T09:00:00Z");
  });
  it("keeps the previous visit during the current one", () => {
    expect(effectiveSince({ previous_seen_at: "2026-10-08T09:00:00Z", last_seen_at: "2026-10-10T11:50:00Z" }, now)).toBe("2026-10-08T09:00:00Z");
  });
});

describe("formatRelative", () => {
  const now = Date.parse("2026-10-10T12:00:00Z");
  it.each([
    ["2026-10-10T11:59:40Z", "just now"], ["2026-10-10T11:45:00Z", "15 min ago"], ["2026-10-10T09:00:00Z", "3 h ago"],
    ["2026-10-09T10:00:00Z", "yesterday"], ["2026-10-07T12:00:00Z", "3 days ago"], ["2026-09-20T12:00:00Z", "20 Sept 2026"],
  ])("%s → %s", (value, expected) => expect(formatRelative(value, now)).toBe(expected));
});

import { describe, expect, it } from "vitest";
import { accessActionLabels, formatDate, formatDateTime, formatFileSize, label } from "./format";

describe("format", () => {
  it("formats ISO dates without shifting the day", () => {
    expect(formatDate("2026-01-10")).toBe("10 Jan 2026");
    expect(formatDate(null)).toBe("-");
    expect(formatDate("not a date")).toBe("-");
  });
  it("formats timestamps in UTC", () => {
    expect(formatDateTime("2026-03-05T14:07:00Z")).toBe("5 Mar 2026, 14:07 UTC");
  });
  it("formats file sizes", () => {
    expect(formatFileSize(2048)).toBe("2 KB");
    expect(formatFileSize(5 * 1048576)).toBe("5.0 MB");
  });
  it("labels known and unknown values", () => {
    expect(label(accessActionLabels, "code_redeem")).toBe("Redeemed a code");
    expect(label(accessActionLabels, "user_suspended")).toBe("User suspended");
  });
});

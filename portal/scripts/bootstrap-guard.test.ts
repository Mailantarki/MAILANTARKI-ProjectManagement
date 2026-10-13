import { describe, expect, it } from "vitest";
import { canBootstrap } from "./bootstrap-guard";

describe("bootstrap guard", () => {
  it("allows the first super admin", () => expect(canBootstrap(0, false)).toBe(true));
  it("rejects a second without --force", () => expect(canBootstrap(1, false)).toBe(false));
  it("allows an explicit --force", () => expect(canBootstrap(1, true)).toBe(true));
});

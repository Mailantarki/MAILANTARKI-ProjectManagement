import { describe, expect, it } from "vitest";
import { slugify } from "./slug";

describe("slugify", () => {
  it("builds a valid web address from a project name", () => {
    expect(slugify("Maylan Plaza — Fase 2")).toBe("maylan-plaza-fase-2");
    expect(slugify("  Córdoba / Güemes  ")).toBe("cordoba-guemes");
    expect(slugify("---")).toBe("");
    expect(slugify("a".repeat(120))).toHaveLength(100);
  });
});

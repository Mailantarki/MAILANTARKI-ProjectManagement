import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../env", () => ({ getServerEnv: () => ({ ACCESS_CODE_PEPPER: "test-pepper-with-at-least-thirty-two-characters" }) }));
import { generateCode } from "./generate";
import { hashCode } from "./hash";

describe("access codes", () => {
  it("generates ten unambiguous symbols and stores only a hex HMAC", () => {
    const code = generateCode();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
    expect(hashCode(code)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashCode(code)).toBe(hashCode(code.toLowerCase().replace("-", "")));
    expect(hashCode(code)).not.toContain(code.replace("-", ""));
  });
});

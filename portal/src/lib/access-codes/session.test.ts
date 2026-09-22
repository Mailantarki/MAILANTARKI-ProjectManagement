import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../env", () => ({ getServerEnv: () => ({ VISITOR_SESSION_SECRET: "test-secret-with-at-least-thirty-two-characters" }) }));
import { createVisitorSession, readVisitorSession, visitorExpiresAt } from "./session";

describe("visitor session", () => {
  it("is signed, limited to eight hours and rejects tampering", async () => {
    const expiry = visitorExpiresAt(null);
    expect(expiry - Date.now()).toBeLessThanOrEqual(8 * 3600_000);
    const id = "61000000-0000-0000-0000-000000000001";
    const token = await createVisitorSession(id, expiry);
    expect(await readVisitorSession(token)).toBe(id);
    expect(await readVisitorSession(`${token}x`)).toBeNull();
  });
  it("uses the earlier code expiry", () => {
    const soon = new Date(Date.now() + 60_000).toISOString();
    expect(visitorExpiresAt(soon)).toBe(Date.parse(soon));
  });
});

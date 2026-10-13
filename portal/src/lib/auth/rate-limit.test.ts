import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../supabase/admin", () => ({ getAdminClient: vi.fn() }));

import { requestIp } from "./rate-limit";

describe("requestIp", () => {
  it("prefers Vercel's trusted forwarding header", () => {
    const request = new Request("https://example.test", { headers: {
      "x-vercel-forwarded-for": "203.0.113.10",
      "x-forwarded-for": "198.51.100.20",
    } });
    expect(requestIp(request)).toBe("203.0.113.10");
  });

  it("falls back to x-forwarded-for for local development", () => {
    const request = new Request("http://localhost", {
      headers: { "x-forwarded-for": "198.51.100.20, 10.0.0.1" },
    });
    expect(requestIp(request)).toBe("198.51.100.20");
  });
});

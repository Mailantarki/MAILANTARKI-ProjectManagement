import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
const { proxy } = await import("./proxy");

describe("email links that land on the Site URL", () => {
  it("forwards ?code= to /auth/confirm", async () => {
    const response = await proxy(new NextRequest("http://localhost:3001/?code=abc123"));
    expect(response.headers.get("location")).toBe("http://localhost:3001/auth/confirm?code=abc123");
  });
  it("forwards token_hash links", async () => {
    const response = await proxy(new NextRequest("http://localhost:3001/?token_hash=h&type=recovery"));
    expect(response.headers.get("location")).toBe("http://localhost:3001/auth/confirm?token_hash=h&type=recovery");
  });
  it("sends expired links to the reset form", async () => {
    const response = await proxy(new NextRequest("http://localhost:3001/?error=access_denied&error_code=otp_expired"));
    expect(response.headers.get("location")).toBe("http://localhost:3001/forgot-password?expired=1");
  });
  it("leaves /auth/confirm and normal pages alone", async () => {
    expect((await proxy(new NextRequest("http://localhost:3001/auth/confirm?code=abc"))).headers.get("location")).toBeNull();
    expect((await proxy(new NextRequest("http://localhost:3001/login"))).headers.get("location")).toBeNull();
  });
});

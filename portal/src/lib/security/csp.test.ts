import { describe, expect, it } from "vitest";
import { contentSecurityPolicy } from "./csp";

describe("contentSecurityPolicy", () => {
  it("uses a nonce for scripts without production unsafe directives", () => {
    const csp = contentSecurityPolicy({ nonce: "test-nonce", development: false });
    const script = csp.split("; ").find((directive) => directive.startsWith("script-src"));
    expect(script).toContain("'nonce-test-nonce'");
    expect(script).toContain("'strict-dynamic'");
    expect(script).not.toContain("'unsafe-inline'");
    expect(script).not.toContain("'unsafe-eval'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
  });

  it("allows eval only for the Next.js development runtime", () => {
    const csp = contentSecurityPolicy({ nonce: "dev", development: true });
    expect(csp).toContain("script-src 'self' 'nonce-dev' 'strict-dynamic' 'unsafe-eval'");
  });

  it("allows local private Storage images during development", () => {
    const csp = contentSecurityPolicy({ nonce: "local", development: true,
      supabaseUrl: "http://127.0.0.1:54321" });
    expect(csp).toContain("img-src 'self' data: https: http://127.0.0.1:54321");
  });
});

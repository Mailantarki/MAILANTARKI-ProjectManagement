import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../supabase/admin", () => ({ getAdminClient: () => ({}) }));
const { publishEmail } = await import("./notify");

describe("publishEmail", () => {
  const email = publishEmail({ projectName: "Maylan <Plaza>", projectUrl: "https://portal.example/projects/maylan-plaza", documents: [
    { segmentId: "s", docNumber: "A-101", title: "Ground floor", revision: "C", kind: "revised", url: "https://portal.example/projects/maylan-plaza/documents/A-101" },
    { segmentId: "s", docNumber: "A-120", title: "Roof", revision: "0", kind: "new", url: "https://portal.example/projects/maylan-plaza/documents/A-120" },
  ] });
  it("summarises the whole batch in one email", () => {
    expect(email.subject).toBe("Maylan <Plaza>: 2 documents published");
    expect(email.text).toContain("New revision · A-101 Ground floor · Rev C");
    expect(email.text).toContain("New · A-120 Roof · Rev 0");
  });
  it("escapes HTML and links only fixed document links", () => {
    expect(email.html).toContain("Maylan &lt;Plaza&gt;");
    expect(email.html).not.toContain("token=");
    expect([...email.html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]).every((href) => href.startsWith("https://portal.example/projects/"))).toBe(true);
  });
});

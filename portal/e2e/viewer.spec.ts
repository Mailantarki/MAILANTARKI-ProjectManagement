import { execFileSync } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { admin, createAuthProfile } from "../scripts/cli-common";
import { generateCode } from "../src/lib/access-codes/generate";

const projectSlug = "mailantarki-sports-complex";
const segments = ["architecture", "mep"] as const;
const fixture = {
  userId: "", codeId: "", projectId: "", mauritiusProjectId: "", documents: [] as string[],
  email: `e2e-${randomBytes(8).toString("hex")}@example.test`,
  password: randomBytes(24).toString("base64url"), code: "",
};

async function required<T>(promise: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const result = await promise;
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

test.describe.serial("private PDF viewer and segment isolation", () => {
  test.beforeAll(async () => {
    const project = await required(admin.from("projects").select("id,organization_id")
      .eq("slug", projectSlug).single());
    fixture.projectId = project.id;
    const mauritius = await required(admin.from("projects").select("id")
      .eq("slug", "mauritius-golf-estate").single());
    fixture.mauritiusProjectId = mauritius.id;
    const segmentRows = await required(admin.from("segments").select("id,slug").in("slug", [...segments]));
    const architecture = segmentRows.find((s) => s.slug === segments[0])!.id;
    const mep = segmentRows.find((s) => s.slug === segments[1])!.id;
    fixture.userId = await createAuthProfile({ email: fixture.email, password: fixture.password,
      fullName: "E2E member", role: "member", organizationId: project.organization_id });
    await required(admin.from("user_project_access").insert({ user_id: fixture.userId,
      project_id: project.id, segment_id: architecture, can_download: false }).select("id").single());
    await required(admin.from("user_project_access").insert({ user_id: fixture.userId,
      project_id: mauritius.id, segment_id: architecture, can_download: false }).select("id").single());
    fixture.code = generateCode();
    const hash = createHmac("sha256", process.env.ACCESS_CODE_PEPPER!)
      .update(fixture.code.replace("-", "")).digest("hex");
    const code = await required(admin.from("access_codes").insert({ organization_id: project.organization_id,
      code_hash: hash, label: `E2E visitor ${fixture.email}`, allow_download: false, max_uses: 1,
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString() }).select("id").single());
    fixture.codeId = code.id;
    await required(admin.from("access_code_grants").insert({ access_code_id: code.id,
      project_id: project.id, segment_id: mep }).select("id").single());
    for (const segment of segments) {
      const output = execFileSync("npx", ["tsx", "scripts/seed-test-document.ts", "--project", projectSlug,
        "--segment", segment], { encoding: "utf8", env: process.env });
      const match = output.match(/Seeded sample document ([a-f0-9-]{36})/);
      if (!match) throw new Error("Could not identify seeded document");
      fixture.documents.push(match[1]);
    }
    const realPdf = resolve("../pdf/MAURITIUS ARCHIVE/MAURITIUS - FLOOR TYPE GF-A.pdf");
    const output = execFileSync("npx", ["tsx", "scripts/seed-test-document.ts", realPdf,
      "--project", "mauritius-golf-estate", "--segment", "architecture"],
    { encoding: "utf8", env: process.env });
    const match = output.match(/Seeded sample document ([a-f0-9-]{36})/);
    if (!match) throw new Error("Could not identify Mauritius test document");
    fixture.documents.push(match[1]);
  });

  test.afterAll(async () => {
    if (fixture.documents.length) {
      const rows = await required(admin.from("documents").select("file_path").in("id", fixture.documents));
      const { error: storageError } = await admin.storage.from("documents").remove(rows.map((r) => r.file_path));
      if (storageError) throw storageError;
      await required(admin.from("documents").delete().in("id", fixture.documents).select("id"));
    }
    if (fixture.codeId) {
      await required(admin.from("access_code_grants").delete().eq("access_code_id", fixture.codeId).select("id"));
      await required(admin.from("access_codes").update({ is_active: false }).eq("id", fixture.codeId).select("id"));
    }
    if (fixture.userId) {
      await required(admin.from("user_project_access").delete().eq("user_id", fixture.userId).select("id"));
      const { error } = await admin.auth.admin.deleteUser(fixture.userId, true);
      if (error) throw error;
    }
  });

  test("member sees only their discipline and navigates the private PDF", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(fixture.email);
    await page.getByLabel("Password").fill(fixture.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/projects$/);
    await expect(page.getByRole("heading", { name: "Project library" })).toBeVisible();
    await page.goto("/admin/users");
    await expect(page).toHaveURL(/\/login$/);
    await page.goto(`/projects/${projectSlug}`);
    const tabs = page.getByRole("navigation", { name: "Disciplines" });
    await expect(tabs.getByRole("link", { name: /^Architecture/ })).toHaveCount(1);
    await expect(tabs.getByRole("link", { name: /Mechanical Electrical/ })).toHaveCount(0);
    await page.getByRole("button", { name: "View" }).first().click();
    const dialog = page.getByRole("dialog", { name: "PDF viewer" });
    await expect(dialog.locator("canvas.react-pdf__Page__canvas")).toBeVisible();
    await expect(dialog.getByText("1 / 3")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Download" })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Next page" }).click();
    await expect(dialog.getByText("2 / 3")).toBeVisible();
    await dialog.getByRole("button", { name: "Zoom in" }).click();
    await expect(dialog.getByText("125%")).toBeVisible();
  });

  test("visitor sees only the code grant and cannot fetch the other PDF", async ({ page, request }) => {
    await page.goto("/");
    await page.getByLabel("Enter access code").fill(fixture.code);
    await page.getByRole("button", { name: "Enter access code" }).click();
    await expect(page).toHaveURL(/\/projects$/);
    await expect(page.getByRole("heading", { name: "Project library" })).toBeVisible();
    await page.goto("/admin/codes");
    await expect(page).toHaveURL(/\/login$/);
    await page.goto(`/projects/${projectSlug}`);
    const tabs = page.getByRole("navigation", { name: "Disciplines" });
    await expect(tabs.getByRole("link", { name: /Mechanical Electrical/ })).toHaveCount(1);
    await expect(tabs.getByRole("link", { name: /^Architecture/ })).toHaveCount(0);
    const cookie = (await page.context().cookies()).find((item) => item.name === "visitor_session");
    expect(cookie).toBeDefined();
    const response = await request.get(`/api/documents/${fixture.documents[0]}/url`, {
      headers: { Cookie: `visitor_session=${cookie!.value}` },
    });
    expect(response.status()).toBe(404);
  });

  test("opens a real Mauritius floor-plan PDF", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(fixture.email);
    await page.getByLabel("Password").fill(fixture.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: "Project library" })).toBeVisible();
    await page.goto("/projects/mauritius-golf-estate");
    await page.getByRole("button", { name: "View" }).first().click();
    const dialog = page.getByRole("dialog", { name: "PDF viewer" });
    await expect(dialog.locator("canvas.react-pdf__Page__canvas")).toBeVisible();
    await expect(dialog.getByText("1 / 1")).toBeVisible();
  });
});

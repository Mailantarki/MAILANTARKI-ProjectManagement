import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { admin, createAuthProfile } from "../scripts/cli-common";

const fixture = {
  userId: "", projectId: "", codeId: "", documents: [] as string[],
  email: `code-admin-${randomBytes(8).toString("hex")}@example.test`,
  password: randomBytes(24).toString("base64url"),
};

test.describe.serial("admin code to isolated visitor session", () => {
  test.beforeAll(async () => {
    const { data: project, error } = await admin.from("projects").select("id,organization_id")
      .eq("slug", "mailantarki-sports-complex").single();
    if (error || !project) throw error ?? new Error("Project unavailable");
    fixture.projectId = project.id;
    fixture.userId = await createAuthProfile({ email: fixture.email, password: fixture.password,
      fullName: "Code circle admin", role: "org_admin", organizationId: project.organization_id });
    for (const segment of ["architecture", "mep"]) {
      const output = execFileSync("npx", ["tsx", "scripts/seed-test-document.ts", "--project",
        "mailantarki-sports-complex", "--segment", segment], { encoding: "utf8", env: process.env });
      const match = output.match(/Seeded sample document ([a-f0-9-]{36})/);
      if (!match) throw new Error("Could not identify PDF fixture");
      fixture.documents.push(match[1]);
    }
  });

  test.afterAll(async () => {
    if (fixture.codeId) {
      await admin.from("access_codes").update({ is_active: false }).eq("id", fixture.codeId);
      await admin.from("access_code_grants").delete().eq("access_code_id", fixture.codeId);
    }
    if (fixture.documents.length) {
      const { data } = await admin.from("documents").select("file_path").in("id", fixture.documents);
      if (data) await admin.storage.from("documents").remove(data.map((row) => row.file_path));
      await admin.from("documents").delete().in("id", fixture.documents);
    }
    if (fixture.userId) await admin.auth.admin.deleteUser(fixture.userId, true);
  });

  test("admin creates a code, isolated visitor sees one discipline, revocation cuts access", async ({ page, browser }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(fixture.email);
    await page.getByLabel("Password").fill(fixture.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/projects$/);
    await page.goto("/admin/codes");
    await expect(page.getByRole("heading", { name: "Access codes" })).toBeVisible();
    await page.getByLabel("Label").fill(`Circle ${fixture.email}`);
    await page.getByLabel("Project").selectOption({ label: "MAILANTARKI Sports Complex" });
    await page.getByLabel("Discipline").selectOption({ label: "Architecture" });
    await page.getByRole("button", { name: "Create code" }).click();
    const dialog = page.getByRole("dialog", { name: "Access code created" });
    await expect(dialog).toBeVisible();
    const code = (await dialog.locator("code").textContent())!.trim();
    expect(code).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
    const { data: saved, error } = await admin.from("access_codes").select("id,code_hash")
      .eq("label", `Circle ${fixture.email}`).single();
    if (error || !saved) throw error ?? new Error("Code missing");
    fixture.codeId = saved.id;
    expect(saved.code_hash).not.toBe(code);
    await dialog.getByRole("button", { name: "Done" }).click();
    await expect(dialog).not.toBeVisible();

    const incognito = await browser.newContext();
    try {
      const visitor = await incognito.newPage();
      await visitor.goto("/");
      await visitor.getByLabel("Enter access code").fill(code);
      await visitor.getByRole("button", { name: "Enter access code" }).click();
      await expect(visitor).toHaveURL(/\/projects$/);
      await visitor.goto("/projects/mailantarki-sports-complex");
      const tabs = visitor.getByRole("navigation", { name: "Disciplines" });
      await expect(tabs.getByRole("link", { name: /^Architecture/ })).toHaveCount(1);
      await expect(tabs.getByRole("link", { name: /Mechanical Electrical/ })).toHaveCount(0);
      const unauthorized = await visitor.request.get(`/api/documents/${fixture.documents[1]}/url`);
      expect(unauthorized.status()).toBe(404);
      page.on("dialog", (prompt) => prompt.accept());
      await page.getByRole("row", { name: new RegExp(`Circle ${fixture.email}`) })
        .getByRole("button", { name: "Revoke" }).click();
      await expect(page.getByRole("row", { name: new RegExp(`Circle ${fixture.email}`) })).toContainText("Revoked");
      const afterRevoke = await visitor.request.get(`/api/documents/${fixture.documents[0]}/url`);
      expect([401, 404]).toContain(afterRevoke.status());
    } finally { await incognito.close(); }
  });
});
